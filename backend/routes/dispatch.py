"""POST /api/dispatch — assign an ambulance to an incident."""

from fastapi import APIRouter, HTTPException
from models.schemas import DispatchRequest, DispatchResponse
from services.data_store import assign_vehicle
from db import log_dispatch

router = APIRouter()

_last_dispatch = {
    "vehicle_id": None,
    "lat": None,
    "lng": None
}


@router.post("/dispatch", response_model=DispatchResponse)
async def dispatch(request: DispatchRequest):
    result = assign_vehicle(
        request.vehicle_id,
        request.incident_location,
        request.incident_lat,
        request.incident_lng,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # ETA from real great-circle distance at ~30 km/h average urban ambulance speed
    import math
    p1, p2 = math.radians(result["lat"]), math.radians(request.incident_lat)
    dp, dl = p2 - p1, math.radians(request.incident_lng - result["lng"])
    km = 2 * 6371 * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))
    eta = round(max(1.0, km / 0.5), 1)

    global _last_dispatch
    try:
        # Check if vehicle or hotspot changed significantly
        v_changed = _last_dispatch["vehicle_id"] != request.vehicle_id
        last_lat = _last_dispatch["lat"]
        last_lng = _last_dispatch["lng"]
        dist_changed = last_lat is None or (abs(last_lat - request.incident_lat) > 0.0001 or abs(last_lng - request.incident_lng) > 0.0001)

        if v_changed or dist_changed:
            _last_dispatch["vehicle_id"] = request.vehicle_id
            _last_dispatch["lat"] = request.incident_lat
            _last_dispatch["lng"] = request.incident_lng
            
            # Map request to log parameters
            vehicle_data = {"id": request.vehicle_id}
            hotspot_data = {"lat": request.incident_lat, "lng": request.incident_lng}
            
            risk_score = 0.85 if request.priority == "critical" else 0.6 if request.priority == "high" else 0.3
            prediction_data = {"risk_score": risk_score, "risk_level": request.priority}
            
            log_dispatch(vehicle_data, hotspot_data, prediction_data, eta)
    except Exception as e:
        print("Dispatch log error:", e)

    return DispatchResponse(
        success=True,
        message=f"{result['name']} dispatched to {request.incident_location}",
        vehicle_id=request.vehicle_id,
        estimated_arrival=f"{eta} min",
    )
