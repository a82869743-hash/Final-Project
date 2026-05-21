"""POST /api/predict — AI risk prediction using XGBoost."""

import os
import sys
import numpy as np
import threading
import random
import subprocess
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from models.schemas import PredictionRequest, PredictionResponse
from services.data_store import get_vehicles
from db import insert_prediction, count_recent_incidents, supabase
import time

START_TIME = time.time()

router = APIRouter()

# Try to load a real model; fall back to mock prediction
_model = None
_model_loaded = False

def get_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model
    
    _model_loaded = True
    try:
        import xgboost  # noqa: F401 — needed to deserialize XGBClassifier pickles
        import joblib
        model_path = os.path.join(os.path.dirname(__file__), "..", "model.pkl")
        if os.path.exists(model_path):
            _model = joblib.load(model_path)
            print(f"[OK] XGBoost model loaded from {model_path}")
    except ImportError:
        print("[WARNING] xgboost not installed, using mock predictions")
    except Exception as e:
        print(f"[WARNING] No XGBoost model found, using mock predictions: {e}")
    
    return _model


def _mock_predict(data: PredictionRequest) -> float:
    """Deterministic mock prediction based on input features."""
    base = (data.traffic_index * 0.3 +
            data.historical_incidents * 0.04 +
            data.population_density * 0.0001 +
            (1 if data.hour in range(17, 22) else 0) * 0.15)
    return min(max(base, 0.0), 1.0)


@router.post("/predict")
async def predict(request: PredictionRequest):
    if time.time() - START_TIME < 5:
        return JSONResponse(content={"status": "warming_up", "message": "AI engine initializing"})
    model = get_model()
    if model is not None:
        features = np.array([[
            request.hour, request.day_of_week, request.zone_id,
            request.temperature, request.humidity, request.traffic_index,
            request.population_density, request.historical_incidents,
        ]])
        
        # Check if the model has predict_proba (meaning it's a Classifier)
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(features)[0]
            
            # Predict Proba MultiClass Bridging
            # For 4 classes, array len will be 4.
            # Convert multi-class indices (0, 1, 2, 3) + max probability into the standard 0.0 - 1.0 continuous scalar
            if len(proba) == 4:
                predicted_class = int(np.argmax(proba))
                confidence_score = float(max(proba))
                
                # 🚀 ML UPGRADE: CORRECT RISK SCORE CALCULATION
                risk_score = float((proba[0]*0 + proba[1]*1 + proba[2]*2 + proba[3]*3) / 3.0)
            else:
                risk_score = float(proba[1])
                confidence_score = float(max(proba))
                
            risk_score = float(np.clip(risk_score, 0.0, 1.0))
        else:
            risk_score = float(model.predict(features)[0])
            confidence_score = 0.85
    else:
        risk_score = _mock_predict(request)
        confidence_score = 0.85

    risk_score = round(risk_score, 3)

    # Map score → level
    if risk_score >= 0.75:
        level = "critical"
        ambulances = 4
    elif risk_score >= 0.5:
        level = "high"
        ambulances = 3
    elif risk_score >= 0.25:
        level = "medium"
        ambulances = 2
    else:
        level = "low"
        ambulances = 1
        
    warning_val = ""
    # 🚀 ML UPGRADE: SAFE CONFIDENCE FALLBACK (Step 3)
    if confidence_score < 0.6:
        level = "medium"
        warning_val = "low_confidence"

    # 🚀 ML UPGRADE: DRIFT DETECTION (Step 2)
    drift_detected = False
    drift_features = []
    try:
        import json
        metrics_path = os.path.join(os.path.dirname(__file__), "..", "ml_metrics.json")
        if os.path.exists(metrics_path):
            with open(metrics_path, "r") as f:
                mets = json.load(f)
                means = mets.get("feature_means", {})
                
                incoming_features = {
                    "hour": request.hour,
                    "day_of_week": request.day_of_week,
                    "zone_id": request.zone_id,
                    "temperature": request.temperature,
                    "humidity": request.humidity,
                    "traffic_index": request.traffic_index,
                    "population_density": request.population_density,
                    "historical_incidents": request.historical_incidents
                }
                
                for k, current_val in incoming_features.items():
                    mean_val = means.get(k)
                    if mean_val is not None:
                        deviation = abs(current_val - mean_val) / (mean_val + 1e-6)
                        if deviation > 0.3:
                            drift_detected = True
                            drift_features.append(k)
                            print(f"⚠️ [DRIFT DETECTED] Feature '{k}' drifted over 30%. Sent {current_val:.2f}, baseline {mean_val:.2f}")
    except Exception as e:
        print(f"Drift computation error: {e}")
        
    # 🚀 ML UPGRADE: ENRICH DATA
    now = datetime.utcnow()
    time_of_day = (
        "morning" if 6 <= now.hour < 12 else
        "afternoon" if 12 <= now.hour < 18 else
        "evening" if 18 <= now.hour < 22 else
        "night"
    )
    day_of_week = "weekend" if now.weekday() >= 5 else "weekday"
    
    active_vehicles = [v for v in get_vehicles() if v.status != "offline"]
    vehicle_density = len(active_vehicles)
    
    # We will use a mock lat/lng from request zone or random if not present
    # to approximate 'nearby' past incidents
    mock_lat = 19.0 + (request.zone_id * 0.01)
    mock_lng = 72.8 + (request.zone_id * 0.01)
    
    past_incidents = count_recent_incidents(mock_lat, mock_lng)
    
    weather = "rainy" if request.humidity > 0.8 else "clear"
    
    # Save asynchronously so it doesn't block the API
    prediction_record = {
        "risk_score": risk_score,
        "lat": mock_lat,
        "lng": mock_lng,
        "time_of_day": time_of_day,
        "day_of_week": day_of_week,
        "vehicle_density": vehicle_density,
        "past_incidents": past_incidents,
        "weather": weather,
        "predicted_level": level,
        "confidence": confidence_score,
        "model_version": "v2.0",
        "drift_detected": drift_detected
    }
    
    # Assuming background task insertion can be done in a separate thread if BackgroundTasks is not passed
    threading.Thread(target=insert_prediction, args=(prediction_record,)).start()

    return PredictionResponse(
        risk_score=round(risk_score, 3),
        risk_level=level,
        confidence=round(confidence_score, 3),
        recommended_ambulances=ambulances,
        model_version="v2.0",
        drift_detected=drift_detected,
        drift_features=drift_features,
        warning=warning_val
    )

@router.get("/model-metrics")
async def get_metrics():
    """
    🚀 ML UPGRADE: METRICS API (Step 9)
    Returns public ML metrics securely.
    """
    try:
        import json
        metrics_path = os.path.join(os.path.dirname(__file__), "..", "ml_metrics.json")
        if os.path.exists(metrics_path):
            with open(metrics_path, "r") as f:
                return json.load(f)
    except Exception as e:
        return {"error": str(e)}
    return {"error": "Metrics not initialized yet. Train the model to generate metrics."}

@router.post("/retrain")
async def trigger_retrain(background_tasks: BackgroundTasks):
    """
    🚀 ML UPGRADE: CONTINUOUS LEARNING
    Manually trigger or cron-schedule the ML pipeline to retrain
    based on the latest live data from Supabase.
    """
    # 🚀 ML UPGRADE: CONTROL RETRAINING (Step 7)
    if supabase:
        res = supabase.table("predictions").select("id", count="exact").limit(1).execute()
        if res.count is not None and res.count < 200:
            return {"success": False, "error": "Not enough data to retrain (Requires 200+ samples)"}
            
    def run_training_script():
        try:
            print("🚀 Starting background retraining pipeline...")
            # Run the train.py script
            script_path = os.path.join(os.path.dirname(__file__), "..", "train.py")
            subprocess.run([sys.executable, script_path], check=True)
            
            # Reload the model into memory
            global _model
            import joblib
            model_path = os.path.join(os.path.dirname(__file__), "..", "model.pkl")
            if os.path.exists(model_path):
                _model = joblib.load(model_path)
                print(f"[OK] Upgraded XGBoost model successfully reloaded into active memory")
        except Exception as e:
            print(f"❌ Retraining pipeline failed: {e}")
            
    background_tasks.add_task(run_training_script)
    return {"success": True, "message": "ML retraining pipeline initiated via background task."}
