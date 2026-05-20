"""Voice processing routes — Transcribe, Analyze, Stream, Siren Detection."""

import os
import io
import asyncio
from fastapi import APIRouter, UploadFile, File
from models.schemas import AnalysisResponse

router = APIRouter()


# ── /api/transcribe — Basic speech-to-text ──

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            return {"error": "OpenAI API key not configured. Use browser speech recognition instead."}

        from openai import OpenAI
        client = OpenAI(api_key=openai_key)

        audio_bytes = await file.read()

        if file.content_type and not file.content_type.startswith("audio/"):
            return {"error": "Invalid file type"}
        if len(audio_bytes) > 5 * 1024 * 1024:
            return {"error": "Audio too large"}

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = file.filename or "audio.webm"

        def run_transcription():
            return client.audio.transcriptions.create(
                model="whisper-1", file=audio_file)

        transcript = await asyncio.wait_for(
            asyncio.to_thread(run_transcription), timeout=15.0)

        text = transcript.text.strip() if hasattr(transcript, "text") else ""
        if not text:
            return {"error": "No speech detected"}
        return {"text": text}
    except asyncio.TimeoutError:
        return {"error": "Transcription timeout exceeded"}
    except Exception as e:
        err_str = str(e)
        if "insufficient_quota" in err_str or "429" in err_str:
            return {"error": "OpenAI API quota exceeded. Use browser speech recognition on the Voice Command page instead."}
        print("Transcription Error:", e)
        return {"error": f"Transcription failed: {err_str[:200]}"}


# ── /api/stream-transcribe — Chunk-based streaming transcription ──

@router.post("/stream-transcribe")
async def stream_transcribe(file: UploadFile = File(...)):
    """Process partial audio chunks for real-time streaming effect."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        audio_bytes = await file.read()

        if len(audio_bytes) < 1000:
            return {"partial_text": "", "status": "waiting"}

        if len(audio_bytes) > 5 * 1024 * 1024:
            return {"error": "Audio chunk too large"}

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = file.filename or "chunk.webm"

        def run():
            return client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )

        transcript = await asyncio.wait_for(
            asyncio.to_thread(run),
            timeout=10.0,
        )

        text = transcript.text.strip() if hasattr(transcript, "text") else ""
        return {"partial_text": text, "status": "streaming"}
    except asyncio.TimeoutError:
        return {"partial_text": "", "status": "timeout"}
    except Exception as e:
        return {"partial_text": "", "status": "error", "error": str(e)}


# ── /api/analyze-full — Full intelligent analysis pipeline ──

@router.post("/analyze-full")
async def analyze_full(file: UploadFile = File(...)):
    """
    Full voice intelligence pipeline:
    Audio -> Transcribe -> GPT NLP Parse -> Siren Detect -> Structured Result
    """
    from services.voice_intelligence import parse_with_gpt, detect_siren_from_bytes

    transcription = ""
    audio_bytes = await file.read()

    # Step 1: Transcribe
    whisper_error = None
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)

            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = file.filename or "audio.webm"

            def run():
                return client.audio.transcriptions.create(
                    model="whisper-1", file=audio_file)

            result = await asyncio.wait_for(
                asyncio.to_thread(run), timeout=15.0)
            transcription = result.text.strip() if hasattr(result, "text") else ""
        except Exception as e:
            err_str = str(e)
            print(f"Whisper API error: {err_str[:200]}")
            if "insufficient_quota" in err_str or "429" in err_str:
                whisper_error = "OpenAI API quota exceeded. Use the Voice Command page with browser speech recognition instead."
            else:
                whisper_error = f"Transcription failed: {err_str[:150]}"
    else:
        whisper_error = "OpenAI API key not configured."

    # If transcription failed, return error instead of mock text
    if not transcription:
        if whisper_error:
            return {"error": whisper_error, "transcription": "", "parsed": None, "siren": None}
        return {"error": "No speech detected in audio.", "transcription": "", "parsed": None, "siren": None}

    # Step 2: GPT NLP Parse
    try:
        parsed = await asyncio.to_thread(parse_with_gpt, transcription)
    except Exception as e:
        err_str = str(e)
        if "insufficient_quota" in err_str or "429" in err_str:
            # GPT also quota-limited — use local keyword parsing
            parsed = _local_parse(transcription)
        else:
            parsed = _local_parse(transcription)

    # Step 3: Siren Detection
    siren_result = detect_siren_from_bytes(audio_bytes)

    return {
        "transcription": transcription,
        "parsed": parsed,
        "siren": siren_result,
        "pipeline": "voice -> whisper -> nlp-parse -> siren-detect",
    }


# ── /api/analyze — Original analysis endpoint (backward-compatible) ──

_CATEGORY_KEYWORDS = {
    "cardiac": (["chest", "heart", "cardiac", "pain", "breathing", "pulse"], "critical"),
    "accident": (["accident", "crash", "collision", "vehicle", "hit", "road"], "critical"),
    "fire": (["fire", "burn", "smoke", "flame", "explosion"], "critical"),
    "fall": (["fall", "fell", "slip", "fracture", "broken", "bone"], "warning"),
    "assault": (["attack", "stab", "shot", "weapon", "blood", "fight"], "critical"),
    "medical": (["fever", "vomit", "faint", "unconscious", "seizure", "diabetic"], "warning"),
    "general": (["help", "emergency", "ambulance", "urgent", "please"], "info"),
}


def _classify(text: str) -> tuple[str, float, str, list[str]]:
    """Classify transcription into category with severity."""
    text_lower = text.lower()
    best_cat = "general"
    best_score = 0.0
    best_severity = "info"
    matched_keywords: list[str] = []

    for cat, (keywords, severity) in _CATEGORY_KEYWORDS.items():
        hits = [kw for kw in keywords if kw in text_lower]
        score = len(hits) / len(keywords)
        if score > best_score:
            best_score = score
            best_cat = cat
            best_severity = severity
            matched_keywords = hits

    confidence = min(0.95, 0.5 + best_score * 0.45)
    return best_cat, confidence, best_severity, matched_keywords


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(file: UploadFile = File(...)):
    """Accepts an audio file, transcribes with Whisper, classifies emergency."""
    transcription = ""
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            audio_bytes = await file.read()
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = file.filename or "audio.webm"
            def run():
                return client.audio.transcriptions.create(
                    model="whisper-1", file=audio_file)
            result = await asyncio.wait_for(
                asyncio.to_thread(run), timeout=15.0)
            transcription = result.text
        except Exception as e:
            err_str = str(e)
            print(f"Whisper API error: {err_str[:200]}")
            if "insufficient_quota" in err_str or "429" in err_str:
                return AnalysisResponse(
                    transcription="",
                    category="error",
                    confidence=0.0,
                    severity="info",
                    keywords=[],
                    error="OpenAI API quota exceeded. Use the Voice Command page instead."
                )

    if not transcription:
        return AnalysisResponse(
            transcription="",
            category="error",
            confidence=0.0,
            severity="info",
            keywords=[],
            error="No speech detected or API unavailable. Use the Voice Command page for browser-based transcription."
        )

    category, confidence, severity, keywords = _classify(transcription)
    return AnalysisResponse(
        transcription=transcription,
        category=category,
        confidence=round(confidence, 3),
        severity=severity,
        keywords=keywords,
    )


# ── Local parsing fallback (no GPT needed) ──

from pydantic import BaseModel

class AnalyzeTextBasicRequest(BaseModel):
    text: str

@router.post("/analyze-text-basic", response_model=AnalysisResponse)
async def analyze_text_basic(req: AnalyzeTextBasicRequest):
    """Basic analysis on pre-transcribed text (no Whisper)."""
    category, confidence, severity, keywords = _classify(req.text)
    return AnalysisResponse(
        transcription=req.text,
        category=category,
        confidence=round(confidence, 3),
        severity=severity,
        keywords=keywords,
    )

def _local_parse(text: str) -> dict:
    """Parse emergency details from text using keyword matching (no GPT)."""
    text_lower = text.lower()
    category, _, severity, _ = _classify(text)

    # Extract location
    location = "unknown"
    import re
    loc_match = re.search(r'(?:near|at|on|in)\s+([A-Z][A-Za-z\s]{2,30}?)(?:\.|,|!|$)', text)
    if loc_match:
        location = loc_match.group(1).strip()

    # Count victims
    victim_count = 0
    num_match = re.search(r'(\d+)\s+(?:people|person|victim|injured|hurt)', text_lower)
    if num_match:
        victim_count = int(num_match.group(1))

    return {
        "location": location,
        "severity": severity,
        "incident_type": category,
        "victim_count": victim_count,
        "key_details": text[:150],
    }
