"""GET /api/vehicles — returns all vehicles with positions."""

from fastapi import APIRouter
from services.data_store import get_vehicles

router = APIRouter()


@router.get("/vehicles")
async def vehicles():
    return get_vehicles()
