"""
Voice Intent Routes — Fixed Pipeline
======================================
POST /api/voice-to-text  — Convert audio file to structured text
POST /api/voice-intent   — Audio -> Text -> Intent -> Action pipeline
POST /api/live-voice     — Live audio chunk processing with intent

Fixed: No mock fallback — always shows real transcription.
"""

import os
import io
import asyncio
from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
from services.voice_processing import transcribe_audio_bytes
from services.intent_detector import detect_intent
from services.action_router import route

router = APIRouter()


@router.post("/voice-to-text")
async def voice_to_text(file: UploadFile = File(...)):
    """Convert uploaded audio file to structured text using Whisper."""
    audio_bytes = await file.read()

    if len(audio_bytes) > 10 * 1024 * 1024:
        return {"error": "Audio file too large (max 10MB)"}
    if len(audio_bytes) < 100:
        return {"error": "Audio file too small - no audio data"}

    result = await asyncio.to_thread(
        transcribe_audio_bytes, audio_bytes, file.filename or "audio.webm"
    )

    return {
        "audio_file": file.filename,
        "text": result.get("text", ""),
        "language": result.get("language", "unknown"),
        "duration": result.get("duration", 0),
        "timestamp": result.get("timestamp", ""),
        "error": result.get("error"),
    }


@router.post("/voice-intent")
async def voice_intent(file: UploadFile = File(...), latitude: Optional[float] = Form(None),
                       longitude: Optional[float] = Form(None)):
    """
    Full voice interaction pipeline:
    Audio -> Whisper Transcription -> Intent Detection -> Action Routing

    NEVER uses mock text — always shows real transcription from Whisper.
    If Whisper fails, returns the error to the frontend.
    """
    audio_bytes = await file.read()

    if len(audio_bytes) > 10 * 1024 * 1024:
        return {"error": "Audio file too large (max 10MB)"}

    print(f"[PIPELINE] Processing {len(audio_bytes)} bytes of audio...")

    # Step 1: Transcribe with Whisper
    transcription_result = await asyncio.to_thread(
        transcribe_audio_bytes, audio_bytes, file.filename or "audio.webm"
    )

    text = transcription_result.get("text", "").strip()
    whisper_error = transcription_result.get("error")

    # If transcription failed, return the error — don't use mock
    if not text:
        return {
            "transcription": "",
            "is_mock": False,
            "whisper_error": whisper_error or "No speech detected in audio",
            "intent": {
                "intent": "unknown",
                "confidence": 0.0,
                "action": "none",
                "description": "Could not transcribe audio",
                "priority": "low",
                "matched_keywords": [],
                "extracted_location": None,
            },
            "action_result": {
                "type": "error",
                "message": whisper_error or "No speech detected. Try speaking louder or longer.",
                "data": None,
            },
            "pipeline": "audio -> whisper (failed)",
        }

    print(f"[PIPELINE] Transcribed: '{text}'")

    # Step 2: Detect intent from REAL transcription
    intent_result = detect_intent(text)

    # Step 3: Route action based on intent
    action_result = await asyncio.to_thread(route, intent_result, latitude, longitude)

    return {
        "transcription": text,
        "is_mock": False,
        "intent": intent_result,
        "action_result": action_result,
        "pipeline": "audio -> whisper -> intent-detect -> action-route",
    }


@router.post("/live-voice")
async def live_voice(file: UploadFile = File(...)):
    """Process live audio chunks (5-10 second recordings)."""
    audio_bytes = await file.read()

    if len(audio_bytes) < 500:
        return {"status": "waiting", "text": "", "intent": None}
    if len(audio_bytes) > 5 * 1024 * 1024:
        return {"error": "Audio chunk too large (max 5MB)"}

    transcription_result = await asyncio.to_thread(
        transcribe_audio_bytes, audio_bytes, "live_chunk.webm"
    )

    text = transcription_result.get("text", "").strip()
    if not text:
        return {"status": "no_speech", "text": "", "intent": None,
                "error": transcription_result.get("error")}

    intent_result = detect_intent(text)

    action_result = None
    if intent_result["confidence"] >= 0.3:
        action_result = await asyncio.to_thread(route, intent_result, None, None, False)

    return {
        "status": "processed",
        "text": text,
        "intent": intent_result,
        "action_result": action_result,
    }
