"""
GET  /api/risk-zones          — real city risk zones (MoRTH 2022) for the map
POST /api/predict-risk        — risk for a coordinate + conditions (real-data engine)
GET  /api/risk-profile/{city} — real hourly accident profile for a city
GET  /api/risk-model          — model card (datasets, metrics)
"""

import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import real_risk

router = APIRouter()

ZONES_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "risk_zones.json")
RISK_COLORS = {"Low": "#10b981", "Medium": "#f59e0b", "High": "#ef4444"}


class AccidentRiskRequest(BaseModel):
    latitude: float
    longitude: float
    traffic_density: float = 2.0      # kept for compatibility; 3 => assume junction
    time: Optional[str] = None        # ISO time or HH:MM
    weather: int = 0                  # 0 Clear, 1 Rain, 2 Fog, 3 Storm/hail
    speed_kmh: Optional[float] = None
    highway: Optional[bool] = None
    vehicles: int = 2
    casualties: int = 1
    pedestrian: bool = False


def _hour(time_str: Optional[str]) -> Optional[int]:
    if not time_str:
        return None
    try:
        from datetime import datetime
        return datetime.fromisoformat(time_str.replace("Z", "+00:00")).hour
    except Exception:
        try:
            return int(time_str.split(":")[0])
        except Exception:
            return None


@router.post("/predict-risk")
async def predict_risk(req: AccidentRiskRequest):
    r = real_risk.assess(req.latitude, req.longitude, hour=_hour(req.time), weather=req.weather,
                         speed_kmh=req.speed_kmh, highway=req.highway, vehicles=req.vehicles,
                         casualties=req.casualties, junction=req.traffic_density >= 3,
                         pedestrian=req.pedestrian)
    return {**r, "color": RISK_COLORS[r["risk_level"]],
            "confidence": 0.9 if r["in_coverage"] else 0.6,
            "features_used": r["conditions"]}


_zones_cache = None


@router.get("/risk-zones")
async def get_risk_zones():
    global _zones_cache
    if _zones_cache is None:
        with open(ZONES_PATH) as f:
            zones = json.load(f)
        card = real_risk.model_card()
        _zones_cache = {"zones": zones, "total": len(zones),
                        "source": "MoRTH Road Accidents in India 2022 (million-plus cities)",
                        "model": {"version": card["model_version"],
                                  "severity_auc": card["severity_model"]["roc_auc"]}}
    return _zones_cache


@router.get("/risk-profile/{city}")
async def risk_profile(city: str):
    p = real_risk.hourly_profile(city)
    if not p:
        raise HTTPException(404, "City not in MoRTH million-plus city dataset")
    return p


@router.get("/risk-model")
async def risk_model():
    return real_risk.model_card()


_MASTER_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "india_road_accident_master.csv")
_stats_cache = None


@router.get("/india-stats")
async def india_stats():
    """Real MoRTH / NCRB city statistics from the master dataset (for Analytics)."""
    global _stats_cache
    if _stats_cache is None:
        import math
        import pandas as pd
        df = pd.read_csv(_MASTER_PATH)
        months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        slots = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-24"]
        clean = lambda v: None if (isinstance(v, float) and math.isnan(v)) else v  # noqa: E731
        cities = [{k: clean(v) for k, v in r.items()} for r in df.to_dict("records")]
        tot = lambda c: float(df[c].sum(skipna=True))  # noqa: E731
        cause_cols = [c for c in df.columns if c.startswith("share_")]
        card = real_risk.model_card()
        _stats_cache = {
            "cities": cities,
            "totals": {
                "accidents_2021": tot("accidents_2021"), "accidents_2022": tot("accidents_2022"),
                "deaths_2021": tot("deaths_2021"), "deaths_2022": tot("deaths_2022"),
                "injured_2022": tot("injured_2022"), "cities": int(len(df)),
            },
            "month_profile_2020": [{"month": m.title(), "accidents": tot(f"acc_2020_{m}")} for m in months],
            "slot_profile_2020": [{"slot": s, "accidents": tot(f"acc_2020_slot_{s}")} for s in slots],
            "national_time_2018": [{"slot": s, "share": card["india_national_time_profile_2018"][s]} for s in slots],
            "weather_2018": [{"weather": k.title(), **v} for k, v in card["india_weather_factors_2018"].items()],
            "cause_share_mean_2020": {c.replace("share_", "").replace("_2020", ""): round(float(df[c].mean()), 4)
                                      for c in cause_cols},
            "sources": ["MoRTH Road Accidents in India 2022 (Table: million-plus cities)",
                        "MoRTH 2020 city-wise time-of-day and month tables",
                        "MoRTH 2018 state-wise weather and national time-of-day tables",
                        "NCRB Accidental Deaths & Suicides in India (ADSI)"],
        }
    return _stats_cache


@router.get("/risk-forecast")
async def risk_forecast(lat: float, lng: float, hours: int = 12, weather: int = 0):
    """Real-data risk for the next N hours at a location."""
    from datetime import datetime
    now = datetime.now().hour
    out = []
    for h in range(max(1, min(hours, 24))):
        hr = (now + h) % 24
        r = real_risk.assess(lat, lng, hour=hr, weather=weather)
        out.append({"offset": h, "hour": f"{hr:02d}:00", "risk_level": r["risk_level"],
                    "percentile": r["percentile"], "p_fatal_or_serious": r["p_fatal_or_serious"],
                    "expected_deaths_per_hour": r["expected_deaths_per_hour"]})
    return {"location": {"lat": lat, "lng": lng}, "forecast": out}
