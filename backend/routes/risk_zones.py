"""
GET  /api/risk-zones   — Pre-computed accident risk zones for map visualization
POST /api/predict-risk — Predict risk level for a specific coordinate
"""

import os
import json
import numpy as np
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# ── Paths ──
ML_DIR = os.path.join(os.path.dirname(__file__), "..", "ml")
MODEL_PATH = os.path.join(ML_DIR, "accident_risk_model.pkl")
METADATA_PATH = os.path.join(ML_DIR, "accident_risk_metadata.json")
GRID_CACHE_PATH = os.path.join(ML_DIR, "grid_accident_counts.json")
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
ACCIDENTS_CSV = os.path.join(PROJECT_ROOT, "india_road_accidents_large.csv")

# ── Load model at startup ──
_risk_model = None
_grid_counts = {}
_metadata = {}

try:
    import joblib
    if os.path.exists(MODEL_PATH):
        _risk_model = joblib.load(MODEL_PATH)
        print(f"[OK] Accident risk model loaded from {MODEL_PATH}")
except Exception as e:
    print(f"[WARNING] Accident risk model not found: {e}")

try:
    if os.path.exists(GRID_CACHE_PATH):
        with open(GRID_CACHE_PATH, "r") as f:
            _grid_counts = json.load(f)
        print(f"[OK] Grid counts loaded: {len(_grid_counts)} cells")
except Exception as e:
    print(f"[WARNING] Grid counts not loaded: {e}")

try:
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r") as f:
            _metadata = json.load(f)
except Exception:
    pass

# ── Class labels ──
RISK_LABELS = {0: "Low", 1: "Medium", 2: "High"}
RISK_COLORS = {"Low": "#10b981", "Medium": "#f59e0b", "High": "#ef4444"}


# ── Request / Response Models ──
class AccidentRiskRequest(BaseModel):
    latitude: float
    longitude: float
    traffic_density: float = 2.0   # 1=Low, 2=Medium, 3=High
    time: Optional[str] = None     # ISO time or HH:MM


def _get_time_of_day(time_str: Optional[str]) -> int:
    """Convert time string to time_of_day category."""
    if not time_str:
        from datetime import datetime
        hour = datetime.utcnow().hour
    else:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
            hour = dt.hour
        except Exception:
            try:
                hour = int(time_str.split(":")[0])
            except Exception:
                hour = 12
    if 6 <= hour < 12:
        return 0
    elif 12 <= hour < 18:
        return 1
    elif 18 <= hour < 22:
        return 2
    return 3


def _get_accident_history(lat: float, lng: float) -> int:
    """Look up accident frequency from grid cache."""
    grid_size = 0.01
    grid_lat = round(round(lat / grid_size) * grid_size, 2)
    grid_lng = round(round(lng / grid_size) * grid_size, 2)
    key = f"{grid_lat:.2f},{grid_lng:.2f}"
    return _grid_counts.get(key, 0)


@router.post("/predict-risk")
async def predict_risk(request: AccidentRiskRequest):
    """
    Predict accident risk level for a specific coordinate.
    Uses the XGBoost model trained on real accident data.
    """
    time_of_day = _get_time_of_day(request.time)
    accident_history = _get_accident_history(request.latitude, request.longitude)
    weather = 0  # default: clear

    features = np.array([[
        request.latitude, request.longitude, request.traffic_density,
        accident_history, time_of_day, weather
    ]])

    if _risk_model is not None:
        if hasattr(_risk_model, "predict_proba"):
            proba = _risk_model.predict_proba(features)[0]
            predicted_class = int(np.argmax(proba))
            confidence = float(max(proba))
            risk_score = float((proba[0] * 0 + proba[1] * 0.5 + proba[2] * 1.0))
        else:
            predicted_class = int(_risk_model.predict(features)[0])
            confidence = 0.85
            risk_score = predicted_class / 2.0
    else:
        # Mock prediction based on heuristics
        score = (accident_history * 0.3 + request.traffic_density * 0.2 +
                 (1 if time_of_day in [2, 3] else 0) * 0.15)
        score = min(max(score / 3.0, 0), 1)
        predicted_class = 2 if score >= 0.6 else (1 if score >= 0.3 else 0)
        confidence = 0.7
        risk_score = score

    risk_level = RISK_LABELS.get(predicted_class, "Medium")

    return {
        "risk_level": risk_level,
        "risk_score": round(risk_score, 3),
        "confidence": round(confidence, 3),
        "color": RISK_COLORS.get(risk_level, "#f59e0b"),
        "features_used": {
            "latitude": request.latitude,
            "longitude": request.longitude,
            "traffic_density": request.traffic_density,
            "accident_history": accident_history,
            "time_of_day": time_of_day,
            "weather": weather,
        }
    }


# ── Risk Zones cache ──
_risk_zones_cache = None

@router.get("/risk-zones")
async def get_risk_zones():
    """
    Return pre-computed accident risk zones for map visualization.
    Groups accidents into geographic grid cells with risk levels.
    """
    global _risk_zones_cache
    if _risk_zones_cache is not None:
        return _risk_zones_cache

    zones = []

    if os.path.exists(ACCIDENTS_CSV):
        try:
            df = pd.read_csv(ACCIDENTS_CSV)
            df.dropna(subset=["latitude", "longitude"], inplace=True)

            grid_size = 0.05  # ~5.5km grid cells for visible map zones
            df["grid_lat"] = (df["latitude"] / grid_size).round(0) * grid_size
            df["grid_lng"] = (df["longitude"] / grid_size).round(0) * grid_size

            grouped = df.groupby(["grid_lat", "grid_lng"]).agg(
                accident_count=("latitude", "size"),
                avg_severity=("severity", lambda x: (
                    x.map({"Low": 0, "Medium": 1, "High": 2}).mean()
                ))
            ).reset_index()

            # Classify risk
            q75 = grouped["accident_count"].quantile(0.75)
            q50 = grouped["accident_count"].quantile(0.50)

            for _, row in grouped.iterrows():
                count = row["accident_count"]
                if count >= q75:
                    risk = "High"
                elif count >= q50:
                    risk = "Medium"
                else:
                    risk = "Low"

                zones.append({
                    "lat": round(float(row["grid_lat"]), 4),
                    "lng": round(float(row["grid_lng"]), 4),
                    "risk_level": risk,
                    "color": RISK_COLORS[risk],
                    "accident_count": int(count),
                    "radius": 2500 if risk == "High" else 1800 if risk == "Medium" else 1200,
                })

            # Limit to top zones for performance
            zones.sort(key=lambda z: z["accident_count"], reverse=True)
            zones = zones[:200]

        except Exception as e:
            print(f"Risk zones error: {e}")

    if not zones:
        # Fallback mock zones (Mumbai area)
        zones = [
            {"lat": 19.076, "lng": 72.877, "risk_level": "High", "color": "#ef4444", "accident_count": 45, "radius": 2500},
            {"lat": 19.033, "lng": 72.844, "risk_level": "Medium", "color": "#f59e0b", "accident_count": 22, "radius": 1800},
            {"lat": 19.114, "lng": 72.870, "risk_level": "High", "color": "#ef4444", "accident_count": 38, "radius": 2500},
            {"lat": 19.060, "lng": 72.830, "risk_level": "Low", "color": "#10b981", "accident_count": 8, "radius": 1200},
            {"lat": 19.090, "lng": 72.866, "risk_level": "Medium", "color": "#f59e0b", "accident_count": 18, "radius": 1800},
            {"lat": 19.230, "lng": 72.857, "risk_level": "Low", "color": "#10b981", "accident_count": 5, "radius": 1200},
            {"lat": 19.172, "lng": 72.957, "risk_level": "Medium", "color": "#f59e0b", "accident_count": 15, "radius": 1800},
        ]

    _risk_zones_cache = {"zones": zones, "total": len(zones)}
    return _risk_zones_cache
