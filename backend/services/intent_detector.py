"""
Intent Detector — NLP + Real Geocoding
========================================
Detects user intent from transcribed text and extracts
real location coordinates using OpenStreetMap Nominatim API.
"""

import re
import requests
from typing import Optional


# ── Intent Definitions ──
INTENT_MAP = {
    "accident": {
        "keywords": ["accident", "crash", "collision", "hit", "smash", "wreck",
                      "pile-up", "pileup", "crashed", "collided", "overturned",
                      "rollover", "derailed", "flipped"],
        "action": "emergency",
        "description": "Accident detected - triggering emergency response",
        "priority": "critical"
    },
    "traffic": {
        "keywords": ["traffic", "congestion", "jam", "slow", "blocked", "gridlock",
                      "stuck", "road block", "heavy traffic", "signal", "red light",
                      "highway", "express", "toll"],
        "action": "show_traffic",
        "description": "Traffic inquiry - showing congestion data",
        "priority": "normal"
    },
    "help": {
        "keywords": ["help", "ambulance", "hospital", "emergency", "injured", "hurt",
                      "bleeding", "unconscious", "pain", "medical", "doctor", "rescue",
                      "save", "dying", "serious", "critical", "need help",
                      "first aid", "paramedic", "stretcher"],
        "action": "locate_help",
        "description": "Help request - locating nearest ambulance/hospital",
        "priority": "high"
    },
    "risk": {
        "keywords": ["risk", "danger", "dangerous", "unsafe", "hazard", "warning",
                      "alert", "prone", "risky", "accident prone", "black spot",
                      "caution", "careful", "avoid"],
        "action": "predict_risk",
        "description": "Risk inquiry - predicting accident risk for area",
        "priority": "normal"
    },
    "fire": {
        "keywords": ["fire", "burn", "burning", "smoke", "flame", "explosion",
                      "blast", "blaze", "inferno", "gas leak", "chemical"],
        "action": "emergency",
        "description": "Fire emergency - triggering emergency response",
        "priority": "critical"
    },
}


def detect_intent(text: str) -> dict:
    """
    Detect user intent from transcribed text using keyword matching.
    Extracts location via real geocoding (OpenStreetMap Nominatim).
    """
    if not text or not text.strip():
        return {
            "intent": "unknown",
            "confidence": 0.0,
            "action": "none",
            "description": "No speech detected",
            "priority": "low",
            "matched_keywords": [],
            "extracted_location": None,
        }

    text_lower = text.lower().strip()

    # Word-boundary matching (plain substring matching made "hit" match
    # "Whitefield" and "jam" match "Jamshedpur"). Score = number of distinct
    # keyword hits, weighted by how urgent the intent is, so
    # "accident ... someone is bleeding" stays an accident, not a generic help call.
    weight = {"critical": 1.3, "high": 1.15, "normal": 1.0}
    scored = []
    for intent_name, config in INTENT_MAP.items():
        matched = [kw for kw in config["keywords"]
                   if re.search(rf"\b{re.escape(kw)}\b", text_lower)]
        if matched:
            scored.append((len(matched) * weight.get(config["priority"], 1.0), intent_name, matched))

    if scored:
        scored.sort(reverse=True)
        best_score, best_intent, best_keywords = scored[0]
        cfg = INTENT_MAP[best_intent]
        best_action, best_desc, best_priority = cfg["action"], cfg["description"], cfg["priority"]
        # injuries reported in an accident/fire -> critical; help calls with injuries -> high
        injury = any(re.search(rf"\b{w}\b", text_lower) for w in
                     ("bleeding", "unconscious", "injured", "dying", "not breathing", "trapped", "dead"))
        if injury and best_priority == "high":
            best_priority = "critical"
        second = scored[1][0] if len(scored) > 1 else 0
        margin = (best_score - second) / best_score
        confidence = min(0.97, 0.5 + 0.12 * len(best_keywords) + 0.25 * margin)
    else:
        best_intent, best_action, best_desc, best_priority, best_keywords = (
            "unknown", "none", "No emergency intent detected", "low", [])
        confidence = 0.1

    # Extract location from text using geocoding
    location = extract_location_smart(text)

    print(f"[INTENT] Text: '{text[:80]}...' -> Intent: {best_intent} ({confidence:.2f}), "
          f"Keywords: {best_keywords}, Location: {location}")

    return {
        "intent": best_intent,
        "confidence": round(confidence, 3),
        "action": best_action,
        "description": best_desc,
        "priority": best_priority,
        "matched_keywords": best_keywords,
        "extracted_location": location,
    }


def extract_location_smart(text: str) -> Optional[dict]:
    """
    Extract location from text using a 2-step approach:
    1. Try to find location phrases in the text
    2. Geocode them using OpenStreetMap Nominatim for accurate coordinates
    """
    # Step 1: Extract potential location phrases
    location_phrase = _extract_location_phrase(text)

    if not location_phrase:
        return None

    # Step 2: Geocode the extracted phrase using Nominatim
    coords = _geocode_location(location_phrase)

    if coords:
        return {
            "name": location_phrase.title(),
            "latitude": coords[0],
            "longitude": coords[1],
        }

    return None



# ── Known Indian cities for instant lookup ──
INDIAN_CITIES = {
    "mumbai", "delhi", "bangalore", "bengaluru", "chennai", "kolkata",
    "hyderabad", "ahmedabad", "pune", "jaipur", "surat", "lucknow",
    "kanpur", "nagpur", "indore", "bhopal", "vadodara", "coimbatore",
    "kochi", "cochin", "patna", "ranchi", "bhubaneswar", "guwahati",
    "chandigarh", "thiruvananthapuram", "trivandrum", "visakhapatnam",
    "vizag", "agra", "varanasi", "noida", "gurugram", "gurgaon",
    "ghaziabad", "faridabad", "thane", "navi mumbai", "nashik",
    "aurangabad", "solapur", "rajkot", "jodhpur", "udaipur",
    "amritsar", "ludhiana", "jalandhar", "dehradun", "haridwar",
    "rishikesh", "shimla", "manali", "mysore", "mysuru", "mangalore",
    "hubli", "belgaum", "goa", "panaji", "margao", "bandra",
    "andheri", "dadar", "worli", "juhu", "powai", "borivali",
    "goregaon", "malad", "kandivali", "vashi", "airoli", "nerul",
    "kharghar", "panvel", "lonavala", "mahabaleshwar", "shirdi",
    "prayagraj", "allahabad", "gorakhpur", "meerut", "bareilly",
    "aligarh", "moradabad", "saharanpur", "jhansi", "mathura",
    "gwalior", "jabalpur", "ujjain", "raipur", "bilaspur",
    "cuttack", "rourkela", "siliguri", "durgapur", "asansol",
    "jamshedpur", "dhanbad", "bokaro", "muzaffarpur", "bhagalpur",
    "tiruchirappalli", "trichy", "madurai", "salem", "tiruppur",
    "erode", "vellore", "tirunelveli", "nellore", "guntur",
    "warangal", "karimnagar", "nizamabad", "rajahmundry", "kakinada",
    "vijayawada", "tirupati", "anantapur", "kurnool", "bellary",
    "davangere", "tumkur", "shivamogga", "udupi", "manipal",
    "kozhikode", "calicut", "thrissur", "palakkad", "kollam",
    "alappuzha", "kottayam", "silchar", "dibrugarh", "jorhat",
    "imphal", "shillong", "aizawl", "agartala", "itanagar",
    "gangtok", "kohima", "srinagar", "jammu", "leh", "dharamshala",
    "sector", "hinjewadi", "whitefield", "electronic city",
    "silk board", "hebbal", "koramangala", "indiranagar",
    "mg road", "brigade road", "connaught place", "rajiv chowk",
    "karol bagh", "saket", "dwarka", "rohini", "pitampura",
}


def _extract_location_phrase(text: str) -> Optional[str]:
    """
    Extract location name from text using:
    1. Known Indian cities dictionary match (case-insensitive)
    2. Regex patterns for prepositional phrases
    3. Capitalized proper noun fallback
    """
    text_lower = text.lower().strip()

    # Step 1: Check for known Indian city names in the text (most reliable)
    # Sort by length descending so "navi mumbai" matches before "mumbai"
    sorted_cities = sorted(INDIAN_CITIES, key=len, reverse=True)
    for city in sorted_cities:
        # word boundaries: "leh" must not match "vehicle", "goa" not "goal"
        if city != "sector" and re.search(rf"\b{re.escape(city)}\b", text_lower):
            return city.title()

    # Step 2: Regex patterns for location phrases
    patterns = [
        r"(?:near|at|in|on|around|close to|towards|heading to|going to|from)\s+([A-Za-z][A-Za-z\s]{2,30}?)(?:\.|,|!|\?|$| and | but )",
        r"(?:near|at|in|on|around)\s+([A-Za-z][A-Za-z\s]{2,30}?)(?:\s+(?:road|highway|express|street|lane|nagar|colony|station|junction|bridge|flyover|area|region|district|city|town))",
        r"([A-Za-z][A-Za-z\s]{2,25}?)\s+(?:road|highway|express|street|lane|nagar|station|junction|bridge|flyover)\b",
    ]

    skip_words = {"the", "a", "an", "this", "that", "there", "here",
                 "please", "help", "send", "need", "very", "really",
                 "major", "big", "small", "two", "three", "multiple",
                 "people", "person", "vehicle", "car", "bus", "truck",
                 "immediately", "quickly", "fast", "soon", "right now",
                 "highway", "road", "the road", "the highway", "street", "expressway", "junction",
                 "flyover", "bridge", "signal", "traffic", "area", "city", "my area", "here now",
                 "fire", "the way", "way", "home", "office", "duty", "time"}

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            if (location.lower() in skip_words or len(location) < 3
                    or location.lower().split()[0] in {"the", "a", "my", "this", "that"} and
                    location.lower().split()[-1] in skip_words):
                continue
            return location

    # Step 3: Fallback — capitalized proper nouns
    common_non_locations = {
        "the", "and", "but", "for", "not", "you", "are", "was", "has",
        "been", "have", "will", "can", "may", "i", "we", "he", "she",
        "they", "please", "help", "send", "need", "there", "traffic",
        "accident", "emergency", "hospital", "ambulance", "fire", "police",
        "blocked", "injured", "crashed", "burning", "immediately",
        "gujarat", "maharashtra", "karnataka", "tamil", "nadu",
        "rajasthan", "madhya", "pradesh", "uttar", "west", "bengal",
    }
    words = text.split()
    for i, word in enumerate(words):
        if len(word) > 2 and word[0].isupper() and word.lower() not in common_non_locations:
            if i + 1 < len(words) and len(words[i + 1]) > 2 and words[i + 1][0].isupper():
                combined = f"{word} {words[i + 1]}"
                if combined.lower() not in common_non_locations:
                    return combined
            return word

    return None


_GEO_CACHE: dict[str, Optional[tuple]] = {}


def _offline_city(location_name: str) -> Optional[tuple]:
    """Fallback when Nominatim is unreachable: real-data city list + hospital registry."""
    key = location_name.lower().strip()
    alias = {"bangalore": "bengaluru", "bombay": "mumbai", "madras": "chennai", "calcutta": "kolkata",
             "vizag": "visakhapatnam", "trichy": "tiruchirappalli", "trivandrum": "thiruvananthapuram",
             "allahabad": "prayagraj", "cochin": "kochi", "calicut": "kozhikode", "nasik": "nashik"}
    key = alias.get(key, key)
    try:
        from ml.real_pipeline import CITIES
        for name, _state, lat, lng in CITIES.values():
            if name.lower().split("-")[0] == key:
                return (lat, lng)
    except Exception:
        pass
    try:
        from services.hospital_registry import HOSPITALS
        for h in HOSPITALS:
            if h[2].lower() == key:
                return (h[4], h[5])
    except Exception:
        pass
    return None


def _geocode_location(location_name: str) -> Optional[tuple]:
    key = location_name.lower().strip()
    if key in _GEO_CACHE:
        return _GEO_CACHE[key]
    coords = _geocode_nominatim(location_name) or _offline_city(location_name)
    _GEO_CACHE[key] = coords
    return coords


def _geocode_nominatim(location_name: str) -> Optional[tuple]:
    """
    Geocode a location name to (latitude, longitude) using
    OpenStreetMap Nominatim API (free, no key needed).
    Biased towards India for accuracy.
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": f"{location_name}, India",
            "format": "json",
            "limit": 1,
            "countrycodes": "in",
        }
        headers = {
            "User-Agent": "AegisTactical/1.0 (Emergency Response System)"
        }

        response = requests.get(url, params=params, headers=headers, timeout=5)

        if response.status_code == 200:
            results = response.json()
            if results:
                lat = round(float(results[0]["lat"]), 6)
                lon = round(float(results[0]["lon"]), 6)
                display = results[0].get("display_name", "")
                print(f"[GEOCODE] '{location_name}' -> ({lat}, {lon}) [{display[:50]}]")
                return (lat, lon)

        print(f"[GEOCODE] No results for '{location_name}'")
        return None

    except Exception as e:
        print(f"[GEOCODE] Error geocoding '{location_name}': {e}")
        return None
