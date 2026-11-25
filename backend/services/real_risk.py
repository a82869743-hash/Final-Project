"""
Real-data accident risk engine (runtime side of ml/real_pipeline.py).

risk for (location, time, conditions) =
      city accident rate for that hour      (MoRTH 2022 total x city's MoRTH 2020 time profile)
    x city fatality rate                    (MoRTH 2022 deaths / accidents)
    x Indian weather fatality multiplier    (MoRTH 2018 deaths per 100 accidents by weather)
    x relative severity from the ML model   (XGBoost trained on 104k STATS19 collisions)

The result is turned into a percentile against every city x time-slot in
the dataset, so "High" means "in the top 15% of real Indian city-hours".
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime

import numpy as np

ML = os.path.join(os.path.dirname(__file__), "..", "ml")
META_PATH = os.path.join(ML, "real_model_metadata.json")
SEV_PATH = os.path.join(ML, "severity_model.pkl")

WEATHER_NAMES = {0: "clear", 1: "rain", 2: "fog", 3: "hail"}
WEATHER_LABELS = {0: "Clear", 1: "Rain", 2: "Fog / mist", 3: "Storm / hail"}
UK_WEATHER = {0: 1, 1: 2, 2: 7, 3: 5}   # STATS19 codes: fine, rain, fog, rain+wind
COVERAGE_KM = 40.0

_meta: dict | None = None
_sev = None
_ref: np.ndarray | None = None


def _load():
    global _meta, _sev, _ref
    if _meta is not None:
        return
    with open(META_PATH) as f:
        _meta = json.load(f)
    try:
        import joblib
        _sev = joblib.load(SEV_PATH)
    except Exception as e:  # model optional: engine still works on real aggregates
        print(f"[WARN] severity model unavailable: {e}")
        _sev = None
    # Reference distribution: every city x slot under clear weather, neutral severity
    vals = []
    for c in _meta["city_profiles"].values():
        if not c["accidents_2022"] or not c["fatality_rate_2022"]:
            continue
        for share in c["slot_share"]:
            if share:
                vals.append(c["accidents_2022"] * share / (365 * 3) * c["fatality_rate_2022"])
    _ref = np.sort(np.array(vals))


def _haversine(a, b, c, d):
    r = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    x = math.sin(math.radians(c - a) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def nearest_city(lat: float, lng: float) -> tuple[str, dict, float]:
    _load()
    name, prof = min(_meta["city_profiles"].items(),
                     key=lambda kv: _haversine(lat, lng, kv[1]["lat"], kv[1]["lng"]))
    return name, prof, _haversine(lat, lng, prof["lat"], prof["lng"])


def _severity(hour, weather, urban, speed_kmh, highway, vehicles, casualties, junction, pedestrian):
    """P(fatal or serious) from the STATS19 model, plus its base rate."""
    sm = _meta["severity_model"]
    base = sm["base_rate_ksi"]
    if _sev is None:
        return base, base
    now = datetime.now()
    dark = hour < 6 or hour >= 19
    light = (4 if urban else 6) if dark else 1
    mph = min([20, 30, 40, 50, 60, 70], key=lambda m: abs(m - speed_kmh / 1.609))
    row = {
        "hour": hour, "day_of_week": now.isoweekday() % 7 + 1, "month": now.month,
        "light_conditions": light, "weather_conditions": UK_WEATHER.get(weather, 1),
        "road_surface_conditions": 2 if weather in (1, 3) else 1,
        "speed_limit": mph, "road_type": 3 if highway else 6,
        "urban_or_rural_area": 1 if urban else 2,
        "junction_detail": 3 if junction else 0, "junction_control": 4 if junction else np.nan,
        "number_of_vehicles": vehicles, "number_of_casualties": casualties,
        "first_road_class": 1 if highway else 3, "pedestrian_crossing": 5 if pedestrian else 0,
        "carriageway_hazards": 0, "special_conditions_at_site": 0,
    }
    X = np.array([[row[f] for f in sm["features"]]], dtype=float)
    p = float(_sev.predict_proba(X)[0, 1])
    odds = p / (1 - p) / sm["pos_weight"]          # undo class weighting -> real probability
    return odds / (1 + odds), base


def assess(lat: float, lng: float, hour: int | None = None, weather: int = 0,
           speed_kmh: float | None = None, highway: bool | None = None, vehicles: int = 2,
           casualties: int = 1, junction: bool = False, pedestrian: bool = False) -> dict:
    _load()
    hour = datetime.now().hour if hour is None else int(hour) % 24
    weather = int(min(max(weather, 0), 3))
    city, prof, dist = nearest_city(lat, lng)
    in_city = dist <= COVERAGE_KM
    urban = dist <= 20
    highway = (not urban) if highway is None else highway
    speed_kmh = speed_kmh or (80 if highway else 40)
    slot = hour // 3
    slots = _meta["slots"]
    nat = _meta["india_national_time_profile_2018"]

    # Frequency (real): accidents/hour for this city & slot
    share = prof["slot_share"][slot] if prof["slot_share"][slot] else nat[slots[slot]]
    if in_city and prof["accidents_2022"]:
        per_hour = prof["accidents_2022"] * share / (365 * 3)
        fatality = prof["fatality_rate_2022"]
        coverage = f"{city} (MoRTH 2022, {dist:.0f} km away)"
    else:
        # Outside million-plus cities: scale the median city down by distance; flagged in response
        meds = [p for p in _meta["city_profiles"].values() if p["accidents_2022"]]
        per_hour = float(np.median([p["accidents_2022"] for p in meds])) * nat[slots[slot]] / (365 * 3) * 0.35
        fatality = float(np.median([p["fatality_rate_2022"] for p in meds])) * 1.25  # rural roads are deadlier
        coverage = f"Outside city coverage — nearest {city} {dist:.0f} km (national profile)"

    wx = _meta["india_weather_factors_2018"][WEATHER_NAMES[weather]]["severity_multiplier"]
    p_ksi, base = _severity(hour, weather, urban, speed_kmh, highway, vehicles, casualties, junction, pedestrian)
    rel_sev = p_ksi / base

    expected = per_hour * fatality * wx * rel_sev
    pct = float(np.searchsorted(_ref, expected) / len(_ref))
    level = "High" if pct >= 0.85 else "Medium" if pct >= 0.5 else "Low"

    nat_share = nat[slots[slot]]
    factors = [
        {"factor": "Location accident rate", "value": f"{per_hour:.2f} accidents/hr",
         "detail": coverage, "impact": "up" if in_city and prof["risk_tier"] == "High" else "neutral"},
        {"factor": "Time of day", "value": f"{slots[slot]} h",
         "detail": f"{share * 100:.1f}% of this city's accidents (national {nat_share * 100:.1f}%)",
         "impact": "up" if share > 0.135 else "down" if share < 0.1 else "neutral"},
        {"factor": "Fatality rate", "value": f"{fatality * 100:.1f} deaths / 100 accidents",
         "detail": "MoRTH 2022", "impact": "up" if fatality > 0.3 else "neutral"},
        {"factor": "Weather", "value": WEATHER_LABELS[weather],
         "detail": f"x{wx:.2f} deaths per accident vs clear (MoRTH 2018, India)",
         "impact": "up" if wx > 1.05 else "neutral"},
        {"factor": "Crash severity (ML)", "value": f"{p_ksi * 100:.1f}% fatal/serious",
         "detail": f"x{rel_sev:.2f} vs average collision — XGBoost on 104k STATS19 records",
         "impact": "up" if rel_sev > 1.1 else "down" if rel_sev < 0.9 else "neutral"},
    ]
    return {
        "risk_level": level,
        "risk_score": round(pct, 3),
        "percentile": round(pct * 100, 1),
        "expected_deaths_per_hour": round(expected, 4),
        "p_fatal_or_serious": round(p_ksi, 4),
        "nearest_city": city, "distance_km": round(dist, 1), "in_coverage": in_city,
        "factors": factors,
        "conditions": {"hour": hour, "weather": WEATHER_LABELS[weather], "urban": urban,
                       "highway": highway, "speed_kmh": speed_kmh, "vehicles": vehicles,
                       "casualties": casualties, "junction": junction, "pedestrian": pedestrian},
    }


def hourly_profile(city: str) -> dict | None:
    _load()
    prof = _meta["city_profiles"].get(city)
    if not prof:
        return None
    return {"city": city, "slots": _meta["slots"], "slot_share": prof["slot_share"],
            "national": [_meta["india_national_time_profile_2018"][s] for s in _meta["slots"]],
            "accidents_2022": prof["accidents_2022"], "deaths_2022": prof["deaths_2022"]}


def model_card() -> dict:
    _load()
    m = {k: v for k, v in _meta.items() if k != "city_profiles"}
    m["cities_covered"] = len(_meta["city_profiles"])
    return m
