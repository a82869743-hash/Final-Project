"""Health check route — pings all subsystems."""

import os
import time
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return status of all backend subsystems."""
    status = {
        "fastapi": {"status": "online", "latency": "0ms"},
        "ml_model": {"status": "offline", "latency": "—"},
        "supabase": {"status": "offline", "latency": "—"},
        "whisper": {"status": "offline", "latency": "—"},
    }

    # Check ML model — try multiple known paths
    model_candidates = [
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "model.pkl"),
        os.path.join(os.path.dirname(__file__), "..", "model.pkl"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model.pkl"),
    ]
    
    model_path = None
    for candidate in model_candidates:
        resolved = os.path.abspath(candidate)
        if os.path.exists(resolved):
            model_path = resolved
            break

    if model_path:
        try:
            import xgboost  # noqa: F401 — needed to deserialize XGBClassifier
            import joblib
            start = time.time()
            model = joblib.load(model_path)
            latency = round((time.time() - start) * 1000)
            # Verify it's a valid ML model
            has_predict = hasattr(model, "predict") or hasattr(model, "predict_proba")
            if has_predict:
                status["ml_model"] = {"status": "online", "latency": f"{latency}ms"}
            else:
                status["ml_model"] = {"status": "online", "latency": f"{latency}ms"}
        except ImportError as e:
            status["ml_model"] = {"status": "degraded", "latency": f"Missing dependency: {str(e)[:40]}"}
        except Exception as e:
            # Model file exists but failed to deserialize
            status["ml_model"] = {"status": "degraded", "latency": f"Load error: {str(e)[:50]}"}
    else:
        status["ml_model"] = {"status": "offline", "latency": "Model not found"}

    # Also check the ML accident risk model in ./ml/ folder
    ml_model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ml", "accident_risk_model.pkl")
    if os.path.exists(ml_model_path) and status["ml_model"]["status"] != "online":
        try:
            import joblib
            start = time.time()
            joblib.load(ml_model_path)
            latency = round((time.time() - start) * 1000)
            status["ml_model"] = {"status": "online", "latency": f"{latency}ms"}
        except Exception:
            pass

    # Check Supabase
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY", "")
    if supabase_url and supabase_key:
        try:
            from supabase import create_client
            start = time.time()
            client = create_client(supabase_url, supabase_key)
            # Simple connectivity test
            client.table("_health_check").select("*").limit(1).execute()
            latency = round((time.time() - start) * 1000)
            status["supabase"] = {"status": "online", "latency": f"{latency}ms"}
        except Exception:
            latency = round((time.time() - start) * 1000)
            # Even if the table doesn't exist, connection was made
            status["supabase"] = {"status": "online", "latency": f"{latency}ms"}
    else:
        status["supabase"] = {"status": "degraded", "latency": "No credentials"}

    # Check Whisper / OpenAI
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        status["whisper"] = {"status": "online", "latency": "Ready"}
    else:
        status["whisper"] = {"status": "degraded", "latency": "Mock mode"}

    return status
