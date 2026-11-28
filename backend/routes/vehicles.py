"""GET /api/vehicles — returns all vehicles with positions."""

from fastapi import APIRouter
from services.data_store import get_vehicles, tick_simulation

router = APIRouter()


@router.get("/vehicles")
async def vehicles():
    tick_simulation()
    return get_vehicles()
