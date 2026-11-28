"""Live weather for the 53 MoRTH cities from Open-Meteo (free, no API key).

One batched request covers every city (current conditions + 48 h hourly
forecast) and is cached for 10 minutes. WMO weather codes are mapped onto
the four MoRTH weather classes the risk engine has real fatality ratios for:
clear, rain, fog/mist and storm/hail.

If Open-Meteo is unreachable the service returns clear-weather defaults and
marks every row `live: false`, so callers can say so instead of pretending.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime

import requests

from services.clock import IST, now_ist

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
CACHE_SECONDS = 600
FAIL_BACKOFF_SECONDS = 120

_lock = threading.Lock()
_cache: dict | None = None
_cache_at = 0.0
_fail_at = 0.0


def wmo_to_class(code: int | None, visibility_m: float | None = None) -> int:
    """WMO code -> 0 clear, 1 rain, 2 fog/mist, 3 storm/hail (risk-engine classes)."""
    if code is None:
        return 0
    if code in (45, 48) or (visibility_m is not None and visibility_m < 1000):
        return 2
    if code >= 95 or code in (77, 85, 86) or 71 <= code <= 75:
        return 3
    if 51 <= code <= 67 or 80 <= code <= 82:
        return 1
    return 0


WMO_TEXT = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain",
    65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow",
    73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers",
    81: "Rain showers", 82: "Violent showers", 85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, heavy hail",
}
CLASS_LABEL = {0: "Clear", 1: "Rain", 2: "Fog / mist", 3: "Storm / hail"}


def _cities() -> dict:
    from services import demand
    return {name: (c["lat"], c["lng"]) for name, c in demand.model()["cities"].items()}


def _fallback(cities: dict) -> dict:
    return {
        "live": False, "source": "unavailable — clear-weather defaults",
        "fetched_at": now_ist().isoformat(),
        "cities": {name: {"lat": lat, "lng": lng, "live": False, "temperature_c": None,
                          "weather_code": None, "description": "No live data", "weather_class": 0,
                          "weather_label": CLASS_LABEL[0], "visibility_m": None, "precipitation_mm": None,
                          "wind_kmh": None, "hourly": []}
                   for name, (lat, lng) in cities.items()},
    }


def _fetch(cities: dict) -> dict:
    names = list(cities)
    params = {
        "latitude": ",".join(f"{cities[n][0]:.4f}" for n in names),
        "longitude": ",".join(f"{cities[n][1]:.4f}" for n in names),
        "current": "temperature_2m,weather_code,visibility,precipitation,wind_speed_10m",
        "hourly": "weather_code,visibility,precipitation_probability,temperature_2m",
        "forecast_days": 2,
        "timezone": "Asia/Kolkata",
    }
    r = requests.get(OPEN_METEO, params=params, timeout=12)
    r.raise_for_status()
    payload = r.json()
    rows = payload if isinstance(payload, list) else [payload]
    out = {}
    for name, row in zip(names, rows):
        cur = row.get("current", {})
        code = cur.get("weather_code")
        vis = cur.get("visibility")
        hourly = []
        h = row.get("hourly", {})
        for i, t in enumerate(h.get("time", [])):
            hc, hv = h["weather_code"][i], (h.get("visibility") or [None] * (i + 1))[i]
            hourly.append({"time": t, "weather_code": hc, "weather_class": wmo_to_class(hc, hv),
                           "precip_prob": (h.get("precipitation_probability") or [None] * (i + 1))[i],
                           "temperature_c": (h.get("temperature_2m") or [None] * (i + 1))[i]})
        cls = wmo_to_class(code, vis)
        out[name] = {
            "lat": cities[name][0], "lng": cities[name][1], "live": True,
            "temperature_c": cur.get("temperature_2m"), "weather_code": code,
            "description": WMO_TEXT.get(code, "—"), "weather_class": cls,
            "weather_label": CLASS_LABEL[cls], "visibility_m": vis,
            "precipitation_mm": cur.get("precipitation"), "wind_kmh": cur.get("wind_speed_10m"),
            "hourly": hourly,
        }
    return {"live": True, "source": "Open-Meteo (open-meteo.com)", "fetched_at": now_ist().isoformat(),
            "cities": out}


def snapshot() -> dict:
    """Current conditions + hourly forecast for every city (cached)."""
    global _cache, _cache_at, _fail_at
    with _lock:
        now = time.time()
        if _cache and now - _cache_at < CACHE_SECONDS:
            return _cache
        cities = _cities()
        if now - _fail_at < FAIL_BACKOFF_SECONDS:
            return _cache or _fallback(cities)
        try:
            _cache = _fetch(cities)
            _cache_at = now
        except Exception as e:  # network blocked, rate limited, ...
            print(f"[WEATHER] Open-Meteo unavailable: {str(e)[:120]}")
            _fail_at = now
            return _cache or _fallback(cities)
        return _cache


def city(name: str) -> dict | None:
    return snapshot()["cities"].get(name)


def class_at(name: str, when: datetime) -> int:
    """Forecast weather class for a city at a given time (falls back to current)."""
    c = city(name)
    if not c:
        return 0
    key = when.astimezone(IST).strftime("%Y-%m-%dT%H:00")
    for h in c.get("hourly", []):
        if h["time"] == key:
            return h["weather_class"]
    return c["weather_class"]
