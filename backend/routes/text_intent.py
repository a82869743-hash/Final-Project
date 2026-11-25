"""
POST /api/text-intent — Process text directly for intent detection
No audio needed — accepts transcribed text from the browser's Web Speech API.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.intent_detector import detect_intent
from services.action_router import route

router = APIRouter()


class TextIntentRequest(BaseModel):
    text: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    auto_dispatch: bool = True


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

    intent_result = detect_intent(text)
    action_result = route(intent_result, request.latitude, request.longitude, request.auto_dispatch)
    return {
        "transcription": text,
        "is_mock": False,
        "intent": intent_result,
        "action_result": action_result,
        "pipeline": "browser-speech-api -> text-intent -> action-route",
    }
