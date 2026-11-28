"""Accident demand forecasting and ambulance pre-positioning.

Runtime side of ml/demand_pipeline.py. For each of the 53 MoRTH cities:

    expected accidents in hour h = annual_2023 / 365
                                   x 12 * month_share[month(h)]
                                   x slot_share[slot(h)] * 8 / 24

(month and slot shares are the empirical-Bayes profiles fitted on NCRB 2023
and MoRTH 2020 counts). Expected deaths multiply by the city's MoRTH 2022
fatality rate and the MoRTH 2018 weather fatality ratio for the forecast
weather (Open-Meteo).

The fleet planner allocates the deployable ambulances across cities in
proportion to expected accidents over the planning horizon (largest-remainder
apportionment), compares that with where units are now, and proposes the
fewest/shortest relocations that close the gap.
"""

from __future__ import annotations

import json
import math
import os
from datetime import timedelta

from services.clock import now_ist

ML = os.path.join(os.path.dirname(__file__), "..", "ml")
MODEL_PATH = os.path.join(ML, "demand_model.json")
WEATHER_NAMES = {0: "clear", 1: "rain", 2: "fog", 3: "hail"}
CITY_RADIUS_KM = 60.0       # a unit within this distance serves that city
ROAD_SPEED_KMH = 55.0       # inter-city repositioning speed (Indian highways, average)
MAX_REPOSITION_HOURS = 4    # never propose a relocation longer than this drive

_model: dict | None = None


def model() -> dict:
    global _model
    if _model is None:
        with open(MODEL_PATH) as f:
            _model = json.load(f)
    return _model


def _weather_mult(cls: int) -> float:
    from services import real_risk
    real_risk._load()
    return real_risk._meta["india_weather_factors_2018"][WEATHER_NAMES[cls]]["severity_multiplier"]


def haversine(a: float, b: float, c: float, d: float) -> float:
    p1, p2 = math.radians(a), math.radians(c)
    x = math.sin(math.radians(c - a) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(x))


def hourly_rate(city: dict, when) -> float:
    """Expected accidents in the hour starting at `when` (IST)."""
    daily = city["accidents_2023"] / 365.0 * 12 * city["month_share"][when.month - 1]
    return daily * city["slot_share"][when.hour // 3] / 3.0


def forecast_city(name: str, hours: int = 24, use_weather: bool = True) -> dict | None:
    m = model()
    c = m["cities"].get(name)
    if not c:
        return None
    from services import weather
    start = now_ist().replace(minute=0, second=0, microsecond=0)
    fr = c["fatality_rate_2022"] or _median_fatality()
    wx_live = weather.city(name) if use_weather else None
    rows = []
    for i in range(max(1, min(hours, 48))):
        t = start + timedelta(hours=i)
        acc = hourly_rate(c, t)
        cls = weather.class_at(name, t) if use_weather else 0
        mult = _weather_mult(cls)
        rows.append({"time": t.isoformat(), "hour": f"{t.hour:02d}:00", "slot": m["slots"][t.hour // 3],
                     "expected_accidents": round(acc, 3), "expected_deaths": round(acc * fr * mult, 4),
                     "weather_class": cls, "weather_multiplier": mult})
    tot_acc = sum(r["expected_accidents"] for r in rows)
    peak = max(rows, key=lambda r: r["expected_accidents"])
    return {
        "city": name, "state": c["state"], "lat": c["lat"], "lng": c["lng"],
        "hours": rows, "total_expected_accidents": round(tot_acc, 2),
        "total_expected_deaths": round(sum(r["expected_deaths"] for r in rows), 3),
        "peak_hour": peak["hour"], "fatality_rate_2022": fr,
        "accidents_2023": c["accidents_2023"],
        "month_share": c["month_share"], "month_counts_2023": c["month_counts_2023"],
        "slot_share": c["slot_share"], "slot_source": c["slot_source"],
        "weather_live": bool(wx_live and wx_live.get("live")),
        "weather_now": wx_live,
    }


def _median_fatality() -> float:
    vals = sorted(c["fatality_rate_2022"] for c in model()["cities"].values() if c["fatality_rate_2022"])
    return vals[len(vals) // 2]


def demand_window(hours: int, use_weather: bool = True) -> dict[str, dict]:
    """Expected accidents and deaths per city over the next `hours` hours."""
    from services import weather
    m = model()
    start = now_ist().replace(minute=0, second=0, microsecond=0)
    med = _median_fatality()
    out = {}
    for name, c in m["cities"].items():
        acc = deaths = 0.0
        fr = c["fatality_rate_2022"] or med
        for i in range(hours):
            t = start + timedelta(hours=i)
            a = hourly_rate(c, t)
            cls = weather.class_at(name, t) if use_weather else 0
            acc += a
            deaths += a * fr * _weather_mult(cls)
        out[name] = {"expected_accidents": acc, "expected_deaths": deaths, "lat": c["lat"], "lng": c["lng"],
                     "state": c["state"]}
    return out


def _apportion(weights: dict[str, float], n: int) -> dict[str, int]:
    """Largest-remainder (Hamilton) apportionment of n units by weight."""
    tot = sum(weights.values()) or 1.0
    quotas = {k: n * w / tot for k, w in weights.items()}
    alloc = {k: int(math.floor(q)) for k, q in quotas.items()}
    left = n - sum(alloc.values())
    for k in sorted(quotas, key=lambda k: quotas[k] - alloc[k], reverse=True)[:left]:
        alloc[k] += 1
    return alloc


def fleet_plan(horizon_hours: int = 6, use_weather: bool = True) -> dict:
    from services.data_store import get_vehicles
    horizon_hours = max(1, min(horizon_hours, 24))
    dem = demand_window(horizon_hours, use_weather)

    # Where are deployable units now? (available units can be repositioned)
    vehicles = get_vehicles()
    deployable = [v for v in vehicles if v.status == "available"]
    busy = [v for v in vehicles if v.status in ("en_route", "on_scene", "critical")]
    current = {k: 0 for k in dem}
    unit_city: dict[str, str] = {}
    outside = 0
    for v in deployable:
        name, d = min(((k, haversine(v.lat, v.lng, c["lat"], c["lng"])) for k, c in dem.items()),
                      key=lambda x: x[1])
        if d <= CITY_RADIUS_KM:
            current[name] += 1
            unit_city[v.id] = name
        else:
            outside += 1

    n = sum(current.values())
    target = _apportion({k: c["expected_accidents"] for k, c in dem.items()}, n)

    # Relocation: match surplus -> deficit city pairs shortest-first, and only
    # pairs a unit can actually drive within the horizon (capped at 4 h).
    max_km = min(horizon_hours, MAX_REPOSITION_HOURS) * ROAD_SPEED_KMH
    surplus = {k: current[k] - target[k] for k in dem if current[k] > target[k]}
    deficit = {k: target[k] - current[k] for k in dem if target[k] > current[k]}
    pairs = sorted(
        ((haversine(dem[s]["lat"], dem[s]["lng"], dem[d]["lat"], dem[d]["lng"]), s, d)
         for s in surplus for d in deficit),
        key=lambda x: x[0])
    moves = []
    for km, sk, dk in pairs:
        if km > max_km:
            break
        take = min(surplus.get(sk, 0), deficit.get(dk, 0))
        if take <= 0:
            continue
        units = [vid for vid, c in unit_city.items() if c == sk][:take]
        for vid in units:
            unit_city[vid] = dk
        moves.append({"from": sk, "to": dk, "units": take, "unit_ids": units,
                      "distance_km": round(km, 1), "drive_min": round(km / ROAD_SPEED_KMH * 60)})
        surplus[sk] -= take
        deficit[dk] -= take
    unmet = {k: v for k, v in deficit.items() if v > 0}

    tot_acc = sum(c["expected_accidents"] for c in dem.values()) or 1.0

    def coverage(alloc: dict[str, int]) -> float:
        # share of expected accidents in cities that hold at least their fair share of units
        return sum(c["expected_accidents"] * min(1.0, alloc[k] / target[k]) if target[k] else c["expected_accidents"]
                   for k, c in dem.items()) / tot_acc

    after = dict(current)
    for mv in moves:
        after[mv["from"]] -= mv["units"]
        after[mv["to"]] += mv["units"]

    rows = []
    for k, c in dem.items():
        acc = c["expected_accidents"]
        rows.append({
            "city": k, "state": c["state"], "lat": c["lat"], "lng": c["lng"],
            "expected_accidents": round(acc, 2), "expected_deaths": round(c["expected_deaths"], 3),
            "demand_share": round(acc / tot_acc, 4),
            "current_units": current[k], "target_units": target[k], "delta": target[k] - current[k],
            "after_units": after[k], "unmet": unmet.get(k, 0),
            "accidents_per_unit": round(acc / current[k], 2) if current[k] else None,
        })
    rows.sort(key=lambda r: r["expected_accidents"], reverse=True)

    from services import weather
    wx = weather.snapshot()
    adverse = [k for k, c in wx["cities"].items() if c["weather_class"] > 0]
    return {
        "generated_at": now_ist().isoformat(),
        "horizon_hours": horizon_hours,
        "fleet": {"total": len(vehicles), "deployable": n, "busy": len(busy),
                  "offline": sum(1 for v in vehicles if v.status == "offline"),
                  "outside_coverage": outside},
        "expected_accidents_total": round(tot_acc, 1),
        "expected_deaths_total": round(sum(c["expected_deaths"] for c in dem.values()), 2),
        "coverage_now": round(coverage(current), 4),
        "coverage_after": round(coverage(after), 4),
        "moves": moves,
        "units_to_move": sum(m["units"] for m in moves),
        "unmet_units": sum(unmet.values()),
        "unmet_cities": sorted(unmet, key=lambda k: -dem[k]["expected_accidents"]),
        "max_reposition_km": round(max_km),
        "cities": rows,
        "weather": {"live": wx["live"], "source": wx["source"], "adverse_cities": adverse},
        "method": ("Units apportioned to cities in proportion to expected accidents over the horizon "
                   "(largest remainder); relocations match surplus and deficit cities shortest-first, "
                   f"limited to drives under {min(horizon_hours, MAX_REPOSITION_HOURS)} h. Gaps no unit can "
                   "reach in time are reported as unmet demand."),
    }


def national_24h() -> list[dict]:
    """Expected accidents across all 53 cities for each of the next 24 hours."""
    m = model()
    start = now_ist().replace(minute=0, second=0, microsecond=0)
    out = []
    for i in range(24):
        t = start + timedelta(hours=i)
        out.append({"time": t.isoformat(), "hour": f"{t.hour:02d}:00",
                    "expected_accidents": round(sum(hourly_rate(c, t) for c in m["cities"].values()), 2)})
    return out


def model_card() -> dict:
    m = model()
    return {k: v for k, v in m.items() if k != "cities"} | {"cities_covered": len(m["cities"])}
