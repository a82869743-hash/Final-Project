"""Intelligent voice processing services — GPT NLP + Siren Detection."""

import os
import io
import json
import numpy as np
import asyncio


# ── PART 1: Smart NLP Parsing (GPT-based) ──

def parse_with_gpt(text: str) -> dict:
    """Extract structured emergency data from transcription using GPT."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        prompt = f"""Extract structured emergency data from this 911 caller text.

Text: "{text}"

Return ONLY valid JSON with these exact fields:
{{
  "location": "extracted location or 'unknown'",
  "severity": "low" | "medium" | "high" | "critical",
  "incident_type": "accident" | "fire" | "medical" | "assault" | "other",
  "victim_count": number or 0,
  "key_details": "one-line summary of the situation"
}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=300,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "location": "unknown",
            "severity": "medium",
            "incident_type": "other",
            "victim_count": 0,
            "key_details": text[:100],
        }
    except Exception as e:
        print("GPT parse error:", e)
        return {
            "location": "unknown",
            "severity": "medium",
            "incident_type": "other",
            "victim_count": 0,
            "key_details": str(e),
        }


# ── PART 3: Siren / Alert Detection (lightweight, no librosa) ──

def detect_siren_from_bytes(audio_bytes: bytes) -> dict:
    """
    Lightweight siren detection using spectral analysis with numpy.
    Analyzes frequency content — sirens typically have high spectral centroid (>3000 Hz).
    Works on raw PCM or WAV data.
    """
    try:
        # Try to parse WAV header
        if audio_bytes[:4] == b"RIFF":
            # Standard WAV: skip 44-byte header
            sample_rate = int.from_bytes(audio_bytes[24:28], "little")
            bits_per_sample = int.from_bytes(audio_bytes[34:36], "little")
            pcm_data = audio_bytes[44:]
        else:
            # Assume raw PCM 16-bit 16kHz
            sample_rate = 16000
            bits_per_sample = 16
            pcm_data = audio_bytes

        if bits_per_sample == 16:
            samples = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32)
        else:
            samples = np.frombuffer(pcm_data, dtype=np.float32)

        if len(samples) < 1024:
            return {"siren_detected": False, "confidence": 0.0}

        # Normalize
        samples = samples / (np.max(np.abs(samples)) + 1e-8)

        # Compute FFT
        fft = np.abs(np.fft.rfft(samples))
        freqs = np.fft.rfftfreq(len(samples), d=1.0 / sample_rate)

        # Spectral centroid
        spectral_centroid = np.sum(freqs * fft) / (np.sum(fft) + 1e-8)

        # Energy in siren frequency range (600-1600 Hz typical siren band)
        siren_mask = (freqs >= 600) & (freqs <= 1600)
        siren_energy = np.sum(fft[siren_mask] ** 2)
        total_energy = np.sum(fft ** 2) + 1e-8
        siren_ratio = siren_energy / total_energy

        # Decision
        is_siren = spectral_centroid > 3000 or siren_ratio > 0.4
        confidence = min(1.0, max(siren_ratio, spectral_centroid / 5000))

        return {
            "siren_detected": bool(is_siren),
            "confidence": round(float(confidence), 3),
            "spectral_centroid": round(float(spectral_centroid), 1),
            "siren_energy_ratio": round(float(siren_ratio), 3),
        }
    except Exception as e:
        print("Siren detection error:", e)
        return {"siren_detected": False, "confidence": 0.0, "error": str(e)}
