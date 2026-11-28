"""
Live conditions, demand forecasting and fleet pre-positioning.

GET  /api/weather/live            current weather for all 53 cities (Open-Meteo)
GET  /api/weather/nearest         weather for the city nearest a coordinate
GET  /api/risk-now                live accident risk for every city (IST hour + live weather)
GET  /api/demand/forecast         hourly accident forecast for one city
GET  /api/demand/national         next-24h expected accidents across all cities
GET  /api/demand/model            demand model card (sources + validation)
GET  /api/fleet/plan              ambulance pre-positioning plan
POST /api/fleet/apply             execute the plan's relocations on the live fleet
"""

from fastapi import APIRouter, HTTPException, Query

from services import demand, real_risk, weather
from services.clock import now_ist

router = APIRouter()


def _strip(c: dict) -> dict:
    return {k: v for k, v in c.items() if k != "hourly"}


@router.get("/weather/live")
async def weather_live(hourly: bool = False):
    snap = weather.snapshot()
    cities = snap["cities"] if hourly else {k: _strip(v) for k, v in snap["cities"].items()}
    return {**{k: v for k, v in snap.items() if k != "cities"}, "cities": cities}


@router.get("/weather/nearest")
async def weather_nearest(lat: float, lng: float):
    m = demand.model()["cities"]
    name = min(m, key=lambda k: demand.haversine(lat, lng, m[k]["lat"], m[k]["lng"]))
    c = weather.city(name) or {}
    return {"city": name, "distance_km": round(demand.haversine(lat, lng, m[name]["lat"], m[name]["lng"]), 1),
            **_strip(c)}


@router.get("/risk-now")
async def risk_now():
    """Accident risk right now in every MoRTH city, using the IST hour and live weather."""
    snap = weather.snapshot()
    hour = now_ist().hour
    rows = []
    for name, c in demand.model()["cities"].items():
        w = snap["cities"].get(name, {})
        cls = w.get("weather_class", 0)
        r = real_risk.assess(c["lat"], c["lng"], hour=hour, weather=cls)
        rows.append({"city": name, "state": c["state"], "lat": c["lat"], "lng": c["lng"],
                     "risk_level": r["risk_level"], "percentile": r["percentile"],
                     "expected_deaths_per_hour": r["expected_deaths_per_hour"],
                     "expected_accidents_next_hour": round(demand.hourly_rate(c, now_ist()), 3),
                     "weather_class": cls, "weather_label": w.get("weather_label", "Clear"),
                     "temperature_c": w.get("temperature_c"), "description": w.get("description")})
    rows.sort(key=lambda r: r["expected_deaths_per_hour"], reverse=True)
    counts = {lvl: sum(1 for r in rows if r["risk_level"] == lvl) for lvl in ("High", "Medium", "Low")}
    return {"generated_at": now_ist().isoformat(), "hour_ist": hour, "weather_live": snap["live"],
            "weather_source": snap["source"], "counts": counts, "cities": rows}


@router.get("/demand/forecast")
async def demand_forecast(city: str, hours: int = Query(24, ge=1, le=48), weather_aware: bool = True):
    f = demand.forecast_city(city, hours, weather_aware)
    if not f:
        raise HTTPException(404, "City not in the 53-city demand model")
    return f


@router.get("/demand/national")
async def demand_national():
    return {"generated_at": now_ist().isoformat(), "hours": demand.national_24h()}


@router.get("/demand/model")
async def demand_model():
    return demand.model_card()


@router.get("/fleet/plan")
async def fleet_plan(horizon: int = Query(6, ge=1, le=24), weather_aware: bool = True):
    return demand.fleet_plan(horizon, weather_aware)


@router.post("/fleet/apply")
async def fleet_apply(horizon: int = Query(6, ge=1, le=24)):
    """Recompute the plan and dispatch every proposed relocation to the live fleet."""
    from services.data_store import reposition_vehicle
    plan = demand.fleet_plan(horizon)
    cities = demand.model()["cities"]
    sent = []
    for mv in plan["moves"]:
        c = cities[mv["to"]]
        for vid in mv["unit_ids"]:
            if reposition_vehicle(vid, mv["to"], c["lat"], c["lng"]):
                sent.append({"vehicle_id": vid, "from": mv["from"], "to": mv["to"], "drive_min": mv["drive_min"]})
    return {"applied": len(sent), "relocations": sent, "coverage_before": plan["coverage_now"],
            "coverage_after": plan["coverage_after"]}
