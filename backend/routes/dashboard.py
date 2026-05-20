"""GET /api/dashboard — returns summary stats."""

from fastapi import APIRouter
from services.data_store import get_dashboard_stats

router = APIRouter()


@router.get("/dashboard")
async def dashboard():
    stats = get_dashboard_stats()
    return stats
