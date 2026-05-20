"""
Voice Processing Service
=========================
Handles audio file transcription using OpenAI Whisper API.
Fixed: Uses simpler response format for reliable transcription.
"""

import os
import io
import csv
import asyncio
import traceback
from datetime import datetime
from typing import Optional


def transcribe_audio_bytes(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Transcribe audio bytes using OpenAI Whisper API.
    Uses 'json' response format for maximum compatibility with browser audio.
    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        print("[VOICE] No OPENAI_API_KEY configured")
        return {"text": "", "language": "unknown", "duration": 0,
                "timestamp": datetime.utcnow().isoformat(),
                "error": "OPENAI_API_KEY not configured"}

    print(f"[VOICE] Transcribing {len(audio_bytes)} bytes as '{filename}'...")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)

        # Create file-like object with proper name
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        # Use 'json' format (not verbose_json) for reliable parsing
        # Whisper supports: webm, mp3, wav, m4a, ogg, flac
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="json",
            language="en",  # Force English for accuracy
        )

        text = ""
        if hasattr(transcript, "text"):
            text = transcript.text.strip()
        elif isinstance(transcript, dict):
            text = transcript.get("text", "").strip()

        print(f"[VOICE] Transcription result: '{text[:100]}...' " if len(text) > 100 else f"[VOICE] Transcription result: '{text}'")

        return {
            "text": text,
            "language": "en",
            "duration": 0,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[VOICE] Whisper transcription error: {error_msg}")
        traceback.print_exc()
        return {"text": "", "language": "unknown", "duration": 0,
                "timestamp": datetime.utcnow().isoformat(), "error": error_msg}


async def transcribe_audio_bytes_async(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """Async wrapper for transcription."""
    return await asyncio.to_thread(transcribe_audio_bytes, audio_bytes, filename)


def batch_transcribe_directory(dir_path: str, output_csv: Optional[str] = None) -> list[dict]:
    """Process all audio files in a directory -> text, optionally save as CSV."""
    AUDIO_EXTENSIONS = {".wav", ".mp3", ".webm", ".ogg", ".m4a", ".flac", ".aac"}
    results = []
    if not os.path.isdir(dir_path):
        return results
    audio_files = [f for f in os.listdir(dir_path)
                   if os.path.splitext(f)[1].lower() in AUDIO_EXTENSIONS]
    for audio_file in audio_files:
        file_path = os.path.join(dir_path, audio_file)
        try:
            with open(file_path, "rb") as f:
                audio_bytes = f.read()
            result = transcribe_audio_bytes(audio_bytes, audio_file)
            result["audio_file"] = audio_file
            results.append(result)
        except Exception as e:
            results.append({"audio_file": audio_file, "text": "", "error": str(e),
                           "timestamp": datetime.utcnow().isoformat()})
    if output_csv and results:
        fieldnames = ["audio_file", "text", "language", "duration", "timestamp"]
        with open(output_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(results)
    return results
