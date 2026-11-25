"""Live hospital monitoring — bed occupancy, critical care, alerts, routing."""

from fastapi import APIRouter, HTTPException, Query

from services import hospital_registry as reg

router = APIRouter()


@router.get("/hospitals")
async def hospitals(city: str | None = None):
    items = reg.list_hospitals(city)
    return {"hospitals": items, "total": len(items)}


@router.get("/hospitals/summary")
async def hospitals_summary():
    return reg.get_summary()


@router.get("/hospitals/alerts")
async def hospitals_alerts(limit: int = Query(25, ge=1, le=100)):
    return {"alerts": reg.get_alerts(limit)}


@router.get("/hospitals/recommend")
async def hospitals_recommend(lat: float, lng: float, need: str = "icu", top_n: int = Query(5, ge=1, le=20)):
    return {"recommendations": reg.recommend(lat, lng, need, top_n)}


@router.get("/hospitals/{hospital_id}")
async def hospital_detail(hospital_id: str):
    h = reg.get_hospital(hospital_id)
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return h
