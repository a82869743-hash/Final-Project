"""POST /api/predict — dashboard risk forecast on the real-data engine.

Uses services.real_risk (MoRTH / NCRB Indian accident statistics + an
XGBoost severity model trained on 104k real STATS19 collisions).
"""

import threading
from datetime import datetime

from fastapi import APIRouter

from db import insert_prediction
from models.schemas import PredictionRequest, PredictionResponse
from services import real_risk

router = APIRouter()

AMBULANCES = {"low": 1, "medium": 2, "high": 3, "critical": 4}


@router.post("/predict")
async def predict(request: PredictionRequest):
    # Humidity > 85% is treated as rain when no explicit weather is given
    weather = request.weather or (1 if request.humidity > 85 else 0)
    r = real_risk.assess(request.latitude, request.longitude, hour=request.hour, weather=weather)
    pct = r["risk_score"]
    level = "critical" if pct >= 0.95 else r["risk_level"].lower()
    # Confidence = how well the location is covered by real city data
    confidence = 0.9 if r["in_coverage"] else 0.6

    record = {
        "risk_score": pct, "lat": request.latitude, "lng": request.longitude,
        "time_of_day": f"{request.hour:02d}:00",
        "day_of_week": "weekend" if datetime.now().weekday() >= 5 else "weekday",
        "weather": r["conditions"]["weather"], "predicted_level": level,
        "confidence": confidence, "model_version": "aegis_real_v3.0",
        "nearest_city": r["nearest_city"],
    }
    threading.Thread(target=insert_prediction, args=(record,), daemon=True).start()

    return PredictionResponse(
        risk_score=pct, risk_level=level, confidence=confidence,
        recommended_ambulances=AMBULANCES[level], model_version="aegis_real_v3.0",
        warning="" if r["in_coverage"] else "outside_city_coverage",
        percentile=r["percentile"], nearest_city=r["nearest_city"],
        p_fatal_or_serious=r["p_fatal_or_serious"], factors=r["factors"],
    )


@router.get("/model-metrics")
async def get_metrics():
    """Model card: datasets, validation metrics and feature importances."""
    return real_risk.model_card()


@router.post("/retrain")
async def trigger_retrain():
    return {"success": False,
            "message": "Retrain offline with `python ml/real_pipeline.py` (uses official datasets)."}
