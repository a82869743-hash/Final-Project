"""
Aegis Tactical — FastAPI Backend
Central server for dashboard stats, alerts, vehicle tracking,
AI prediction (XGBoost), and call analysis (Whisper).
"""

from dotenv import load_dotenv
import os

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# Verify environment variables
print()
print("--- ENVIRONMENT CHECK ---")
if os.getenv("SUPABASE_URL"):
    print(f"[OK] SUPABASE URL: {os.getenv('SUPABASE_URL')}")
else:
    print("[MISSING] SUPABASE URL: Missing")
    
if os.getenv("SUPABASE_KEY"):
    print(f"[OK] SUPABASE KEY: {'*' * 10}{os.getenv('SUPABASE_KEY')[-5:] if os.getenv('SUPABASE_KEY') else ''}")
else:
    print("[MISSING] SUPABASE KEY: Missing")

openai_key = os.getenv("OPENAI_API_KEY")
if openai_key and openai_key.startswith("sk-") and len(openai_key) > 20:
    print(f"[OK] OPENAI KEY: {openai_key[:10]}...{openai_key[-4:]}")
else:
    print("[MISSING] OPENAI_API_KEY: Not set or invalid — voice features will not work")
print("-------------------------\n")


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# ── NEW: Video Intelligence Module (feature-flagged) ──
_enable_video_ai = os.getenv("ENABLE_VIDEO_AI", "true").lower() in ("true", "1", "yes")
if _enable_video_ai:
    try:
        from routes.video import router as video_router
        from routes.video_ws import router as video_ws_router
        print("[OK] Video Intelligence module loaded")
    except Exception as _e:
        print(f"[WARN] Video Intelligence module unavailable: {_e}")
        video_router = None
        video_ws_router = None
else:
    print("[INFO] Video Intelligence disabled (ENABLE_VIDEO_AI=false)")
    video_router = None
    video_ws_router = None

app = FastAPI(
    title="Sentinel API",
    version="1.0.0",
    description="AI-powered emergency dispatch command center backend",
)

# ── CORS — allow all Next.js dev server variants ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "*",  # Allow all origins for deployed demo
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ── NEW: Video Intelligence routers (fail-safe) ──
if video_router is not None:
    app.include_router(video_router, prefix="/api", tags=["Video Intelligence"])
if video_ws_router is not None:
    app.include_router(video_ws_router, tags=["Video WebSocket"])


@app.get("/")
async def root():
    return {"status": "online", "service": "Aegis Tactical API"}

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
