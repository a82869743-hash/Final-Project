"""GET /api/alerts — returns active alerts list."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from services.data_store import get_alerts
import time

START_TIME = time.time()

router = APIRouter()


@router.get("/alerts")
async def alerts():
    if time.time() - START_TIME < 5:
        return JSONResponse(content={"status": "warming_up", "message": "AI engine initializing"})
    return get_alerts()
