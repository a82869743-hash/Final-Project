"""
Aegis Tactical — FastAPI Backend
Central server for dashboard stats, alerts, vehicle tracking,
AI prediction (XGBoost), and call analysis (Whisper).
"""

from dotenv import load_dotenv
import os

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

os.environ["YOLO_CONFIG_DIR"] = "/tmp/Ultralytics"
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib"

try:
    import matplotlib
    matplotlib.use("Agg")
except ImportError:
    pass

# Verify environment variables
print()
print("--- ENVIRONMENT CHECK ---")
if os.getenv("SUPABASE_URL"):
    print("[OK] SUPABASE URL: set")
else:
    print("[MISSING] SUPABASE URL: Missing")
    
if os.getenv("SUPABASE_KEY"):
    print("[OK] SUPABASE KEY: set")
else:
    print("[MISSING] SUPABASE KEY: Missing")

openai_key = os.getenv("OPENAI_API_KEY")
if openai_key and openai_key.startswith("sk-") and len(openai_key) > 20:
    print("[OK] OPENAI KEY: set")
else:
    print("[MISSING] OPENAI_API_KEY: Not set or invalid — voice features will not work")
print("-------------------------\n")


from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import traceback

from routes.dashboard import router as dashboard_router
from routes.alerts import router as alerts_router
from routes.vehicles import router as vehicles_router
from routes.predict import router as predict_router
from routes.analyze import router as analyze_router
from routes.dispatch import router as dispatch_router
from routes.websocket import router as ws_router
from routes.health import router as health_router
from routes.analytics import router as analytics_router
from routes.risk_zones import router as risk_zones_router
from routes.voice_intent import router as voice_intent_router
from routes.emergency import router as emergency_router
from routes.text_intent import router as text_intent_router
from routes.hospitals import router as hospitals_router
from routes.live import router as live_router

# ── Video Intelligence: routes always on; ENABLE_VIDEO_AI only toggles the
#    heavy YOLO model (the OpenCV detector works without it) ──
try:
    from routes.video import router as video_router
    from routes.video_ws import router as video_ws_router
    print("[OK] Video Intelligence routes loaded "
          f"(YOLO {'enabled' if os.getenv('ENABLE_VIDEO_AI', 'false').lower() in ('true', '1', 'yes') else 'disabled'})")
except Exception as _e:
    print(f"[WARN] Video Intelligence module unavailable: {_e}")
    video_router = None
    video_ws_router = None

app = FastAPI(
    title="Sentinel API",
    version="1.0.0",
    description="AI-powered emergency dispatch command center backend",
)

# ── CORS — allow all origins for deployment ──
# NOTE: allow_credentials must be False when using wildcard origins
# This is safe for our use case (no cookie-based auth; we use Supabase tokens)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        print(f"{request.method} {request.url.path} {response.status_code} {process_time:.2f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        print(f"{request.method} {request.url.path} 500 {process_time:.2f}s")
        print(traceback.format_exc())
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

# ── Register routers ──
app.include_router(dashboard_router, prefix="/api", tags=["Dashboard"])
app.include_router(alerts_router, prefix="/api", tags=["Alerts"])
app.include_router(vehicles_router, prefix="/api", tags=["Vehicles"])
app.include_router(predict_router, prefix="/api", tags=["AI Prediction"])
app.include_router(analyze_router, prefix="/api", tags=["Call Analyzer"])
app.include_router(dispatch_router, prefix="/api", tags=["Dispatch"])
app.include_router(ws_router, tags=["WebSocket"])
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(analytics_router, prefix="/api", tags=["Analytics"])
app.include_router(risk_zones_router, prefix="/api", tags=["Risk Zones"])
app.include_router(voice_intent_router, prefix="/api", tags=["Voice Intent"])
app.include_router(emergency_router, prefix="/api", tags=["Emergency"])
app.include_router(text_intent_router, prefix="/api", tags=["Text Intent"])
app.include_router(hospitals_router, prefix="/api", tags=["Hospitals"])
app.include_router(live_router, prefix="/api", tags=["Live Conditions & Fleet Planning"])

# ── NEW: Video Intelligence routers (fail-safe) ──
if video_router is not None:
    app.include_router(video_router, prefix="/api", tags=["Video Intelligence"])
if video_ws_router is not None:
    app.include_router(video_ws_router, tags=["Video WebSocket"])


@app.get("/")
async def root():
    return {"status": "online", "service": "Aegis Tactical API"}


@app.get("/health")
async def health_probe():
    """Lightweight liveness probe for Render / load-balancers."""
    from datetime import datetime, timezone
    return {
        "status": "online",
        "database": "supabase" if os.getenv("SUPABASE_URL") else "sqlite-local",
        "ai": "ready" if os.getenv("OPENAI_API_KEY") else "mock",
        "websocket": "active",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
async def readiness_probe():
    """Readiness probe — returns true once the app is accepting traffic."""
    return {"ready": True}

@app.get("/api/test-db")
def test_db():
    try:
        from db import supabase
        res = supabase.table("vehicles").select("*").limit(1).execute()
        return {
            "status": "connected",
            "data": res.data
        }
    except Exception as e:
        print(f"Database Error: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }
