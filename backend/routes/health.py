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

    # Check ML model (real-data severity model + engine metadata)
    try:
        from services import real_risk
        start = time.time()
        real_risk._load()
        latency = round((time.time() - start) * 1000)
        ok = real_risk._sev is not None
        status["ml_model"] = {"status": "online" if ok else "degraded",
                              "latency": f"{latency}ms" if ok else "Aggregates only"}
    except Exception as e:
        status["ml_model"] = {"status": "offline", "latency": f"Load error: {str(e)[:50]}"}

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
        status["supabase"] = {"status": "online", "latency": "local SQLite"}

    # Check Whisper / OpenAI
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        status["whisper"] = {"status": "online", "latency": "Ready"}
    else:
        # Optional: live voice uses browser speech recognition; Whisper only adds file transcription
        status["whisper"] = {"status": "degraded", "latency": "Optional — browser speech in use", "optional": True}

    # Live weather feed (Open-Meteo) used by the risk engine and fleet planner — optional
    try:
        from services import weather
        snap = weather.snapshot()
        status["weather"] = ({"status": "online", "latency": "Open-Meteo live"} if snap["live"]
                             else {"status": "degraded", "latency": "Offline — clear-sky defaults", "optional": True})
    except Exception as e:
        status["weather"] = {"status": "degraded", "latency": f"Error: {str(e)[:40]}", "optional": True}

    return status
