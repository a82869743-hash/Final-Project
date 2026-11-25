"""POST /api/emergency — Find nearest ambulance + hospital."""

from fastapi import APIRouter
from pydantic import BaseModel
from services.emergency_service import get_emergency_response, find_nearest_ambulance, find_nearest_hospital

router = APIRouter()


class EmergencyRequest(BaseModel):
    latitude: float
    longitude: float


@router.post("/emergency")
async def emergency(request: EmergencyRequest):
    """
    Find nearest ambulance and hospital for an emergency location.
    Uses real GPS and hospital CSV datasets with Haversine distance.
    """
    result = get_emergency_response(request.latitude, request.longitude)
    return result


@router.get("/geocode")
async def geocode(q: str):
    """Place name -> coordinates (OpenStreetMap Nominatim, offline city fallback)."""
    import asyncio
    from services.intent_detector import _geocode_location
    coords = await asyncio.to_thread(_geocode_location, q)
    if not coords:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Could not locate '{q}' in India")
    return {"query": q, "latitude": coords[0], "longitude": coords[1]}
