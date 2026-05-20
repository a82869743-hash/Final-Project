"""
POST /api/text-intent — Process text directly for intent detection
No audio needed — accepts transcribed text from the browser's Web Speech API.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.intent_detector import detect_intent
from services.emergency_service import get_emergency_response

router = APIRouter()


class TextIntentRequest(BaseModel):
    text: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/text-intent")
async def text_intent(request: TextIntentRequest):
    """
    Process text for intent detection and action routing.
    Used when transcription is done on the frontend via Web Speech API.
    """
    text = request.text.strip()
    if not text:
        return {
            "transcription": "",
            "intent": {
                "intent": "unknown", "confidence": 0.0, "action": "none",
                "description": "No text provided", "priority": "low",
                "matched_keywords": [], "extracted_location": None,
            },
            "action_result": {
                "type": "error", "message": "No text provided", "data": None
            },
        }

    # Detect intent
    intent_result = detect_intent(text)

    # If user provided coordinates and no location was extracted from text,
    # use the provided coordinates
    location = intent_result.get("extracted_location")
    if not location and request.latitude and request.longitude:
        location = {
            "name": "Current Location",
            "latitude": request.latitude,
            "longitude": request.longitude,
        }
        intent_result["extracted_location"] = location

    # Route action
    action = intent_result.get("action", "none")
    lat = location["latitude"] if location else (request.latitude or 19.076)
    lng = location["longitude"] if location else (request.longitude or 72.877)
    loc_name = location["name"] if location else "current location"

    action_result = _route_action_sync(action, lat, lng, loc_name, location)

    return {
        "transcription": text,
        "is_mock": False,
        "intent": intent_result,
        "action_result": action_result,
        "pipeline": "browser-speech-api -> text-intent -> action-route",
    }


def _route_action_sync(action: str, lat: float, lng: float,
                        loc_name: str, location: dict | None) -> dict:
    """Route intent to action (sync version)."""
    if action == "emergency":
        data = get_emergency_response(lat, lng)
        return {"type": "emergency",
                "message": f"Emergency response triggered for {loc_name}",
                "data": data}

    elif action == "locate_help":
        data = get_emergency_response(lat, lng)
        return {"type": "help",
                "message": f"Nearest help located for {loc_name}",
                "data": data}

    elif action == "show_traffic":
        return {"type": "traffic",
                "message": f"Showing traffic congestion data for {loc_name}",
                "data": {"redirect": "/dashboard", "location": location}}

    elif action == "predict_risk":
        return {"type": "risk",
                "message": f"Risk prediction for {loc_name}",
                "data": {"redirect": "/dashboard", "location": location,
                         "coordinates": {"latitude": lat, "longitude": lng}}}

    return {"type": "general",
            "message": f"Processed: {loc_name}",
            "data": {"location": location}}
