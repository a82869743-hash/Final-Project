"""GET /api/alerts — returns active alerts list."""

from fastapi import APIRouter
from services.data_store import get_alerts

router = APIRouter()


@router.get("/alerts")
async def alerts():
    return get_alerts()
