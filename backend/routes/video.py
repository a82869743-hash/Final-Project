"""
Aegis Tactical — Video Intelligence API Routes
================================================
Modular FastAPI router for video analysis endpoints.
Feature flag: ENABLE_VIDEO_AI
Does NOT modify any existing route or endpoint.
"""

import os
import uuid
import logging
import tempfile
import shutil
from typing import Optional
import time

from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

START_TIME = time.time()

logger = logging.getLogger("aegis.routes.video")

router = APIRouter()

ENABLE_VIDEO_AI = os.getenv("ENABLE_VIDEO_AI", "true").lower() in ("true", "1", "yes")
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "aegis_video_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Response Models ──────────────────────────────────────────────

class VideoAnalysisResponse(BaseModel):
    id: str = ""
    event_type: str = ""
    severity: str = ""
    confidence: float = 0.0
    objects_detected: list[str] = []
    vehicle_count: int = 0
    people_count: int = 0
    timestamp: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    video_source: str = ""
    frames_analyzed: int = 0
    processing_time_seconds: float = 0.0
    detection_method: str = ""
    scene_label: str = ""
    error: Optional[str] = None
    # Enhanced fields
    accident_type: Optional[str] = None
    accident_description: Optional[str] = None
    severity_score: Optional[float] = None
    vehicle_types: Optional[dict] = None
    vehicle_breakdown: Optional[str] = None
    overlap_ratio: Optional[float] = None
    accident_frames: Optional[int] = None
    accident_frame_ratio: Optional[float] = None
    video_metadata: Optional[dict] = None
    action_recommendation: Optional[str] = None
    alert_status: Optional[str] = None
    location: Optional[str] = None
    location_confidence: Optional[str] = None
    location_method: Optional[str] = None
    source_camera: Optional[str] = None
    demo_mode: Optional[bool] = None


class VideoEventRecord(BaseModel):
    id: str
    timestamp: str
    event_type: str
    severity: str
    confidence: float
    objects_detected: list[str] = []
    latitude: float = 0.0
    longitude: float = 0.0
    video_source: str = ""


class VideoAIStatus(BaseModel):
    status: str
    feature_flag: bool
    opencv_available: bool
    yolo_available: bool
    frame_interval: int
    confidence_threshold: float
    alert_threshold: float


# ── Background task: analyze + store + broadcast ─────────────────

async def _process_video_background(
    video_path: str,
    latitude: float,
    longitude: float,
    video_source: str,
    frame_interval: int,
):
    """Background worker for heavy video processing."""
    try:
        from services.video_intelligence import (
            analyze_video, store_video_event, ALERT_THRESHOLD
        )

        result = await analyze_video(
            video_path=video_path,
            latitude=latitude,
            longitude=longitude,
            video_source=video_source,
            frame_interval=frame_interval,
        )

        # Persist to Supabase
        if result.get("event_type") not in ("error", "disabled"):
            await store_video_event(result)

        # Broadcast VIDEO_ALERT via WebSocket if confidence exceeds threshold
        if result.get("confidence", 0) >= ALERT_THRESHOLD:
            try:
                from routes.video_ws import broadcast_video_alert
                await broadcast_video_alert({
                    "type": "VIDEO_ALERT",
                    "location": f"{latitude},{longitude}",
                    "severity": result.get("severity", "low"),
                    "event": result.get("event_type", "unknown"),
                    "confidence": result.get("confidence", 0),
                    "timestamp": result.get("timestamp", ""),
                })
            except Exception as e:
                logger.error(f"WebSocket broadcast failed: {e}")

    except Exception as e:
        logger.error(f"Background video processing error: {e}")
    finally:
        # Cleanup temp file
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception:
            pass


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/video/analyze", response_model=VideoAnalysisResponse,
             summary="Analyze uploaded video for emergency events")
async def analyze_video_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    latitude: float = Form(0.0),
    longitude: float = Form(0.0),
    video_source: str = Form("upload"),
    frame_interval: int = Form(5),
    async_mode: bool = Form(False),
):
    """
    Upload an MP4/video file for AI analysis.
    
    - **async_mode=false** (default): Processes synchronously and returns results.
    - **async_mode=true**: Queues processing in background, returns immediately.
    """
    if not ENABLE_VIDEO_AI:
        raise HTTPException(status_code=503, detail="Video AI is disabled (ENABLE_VIDEO_AI=false)")

    # Validate file type
    allowed = (".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}. Allowed: {allowed}")

    # Save uploaded file to temp
    file_id = str(uuid.uuid4())
    video_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")

    try:
        with open(video_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    if async_mode:
        # Queue for background processing
        background_tasks.add_task(
            _process_video_background,
            video_path, latitude, longitude, video_source, frame_interval,
        )
        return VideoAnalysisResponse(
            id=file_id,
            event_type="processing",
            severity="low",
            confidence=0.0,
            timestamp="",
            video_source=video_source,
        )

    # Synchronous processing
    try:
        from services.video_intelligence import (
            analyze_video, store_video_event, ALERT_THRESHOLD,
            DEMO_MODE, generate_demo_report,
        )

        result = await analyze_video(
            video_path=video_path,
            latitude=latitude,
            longitude=longitude,
            video_source=video_source,
            frame_interval=frame_interval,
        )

        # Store to DB
        if result.get("event_type") not in ("error", "disabled"):
            await store_video_event(result)

        # Broadcast alert if threshold met
        if result.get("confidence", 0) >= ALERT_THRESHOLD:
            try:
                from routes.video_ws import broadcast_video_alert
                await broadcast_video_alert({
                    "type": "VIDEO_ALERT",
                    "location": result.get("location", f"{latitude},{longitude}"),
                    "severity": result.get("severity", "low"),
                    "event": result.get("event_type", "unknown"),
                    "confidence": result.get("confidence", 0),
                    "timestamp": result.get("timestamp", ""),
                })
            except Exception:
                pass

        return VideoAnalysisResponse(**{
            k: v for k, v in result.items()
            if k in VideoAnalysisResponse.model_fields
        })

    except Exception as e:
        # Fallback to demo mode if real processing fails
        if DEMO_MODE:
            logger.info(f"Real analysis failed ({e}), falling back to demo mode")
            demo = await generate_demo_report(video_source=video_source)
            return VideoAnalysisResponse(**{
                k: v for k, v in demo.items()
                if k in VideoAnalysisResponse.model_fields
            })
        logger.error(f"Video analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except Exception:
            pass


@router.get("/video/events", summary="List recent video events")
async def list_video_events(limit: int = 50):
    """Retrieve recent video analysis events from Supabase."""
    if time.time() - START_TIME < 5:
        return JSONResponse(content={"status": "warming_up", "message": "AI engine initializing"})
    if not ENABLE_VIDEO_AI:
        return {"events": [], "message": "Video AI disabled"}

    try:
        from db import supabase
        if supabase is None:
            return {"events": [], "message": "Database unavailable"}

        res = supabase.table("video_events") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()

        return {"events": res.data or [], "total": len(res.data or [])}
    except Exception as e:
        logger.error(f"List events error: {e}")
        return {"events": [], "error": str(e)}


@router.get("/video/status", response_model=VideoAIStatus,
            summary="Video AI subsystem health status")
async def video_ai_status():
    """Return status of the Video AI subsystem."""
    try:
        from services.video_intelligence import get_video_ai_status
        return VideoAIStatus(**get_video_ai_status())
    except Exception as e:
        return VideoAIStatus(
            status="error", feature_flag=ENABLE_VIDEO_AI,
            opencv_available=False, yolo_available=False,
            frame_interval=5, confidence_threshold=0.55,
            alert_threshold=0.70,
        )
