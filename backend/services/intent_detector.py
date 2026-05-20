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

    best_intent = "unknown"
    best_score = 0.0
    best_action = "none"
    best_desc = "No intent detected"
    best_priority = "low"
    best_keywords: list[str] = []

    for intent_name, config in INTENT_MAP.items():
        keywords = config["keywords"]
        matched = [kw for kw in keywords if kw in text_lower]

        # Weight by number of matched keywords relative to total
        score = len(matched) / max(len(keywords), 1)

        # Bonus for multiple keyword matches (stronger signal)
        if len(matched) >= 2:
            score = min(1.0, score + 0.15)

        if score > best_score:
            best_score = score
            best_intent = intent_name
            best_action = config["action"]
            best_desc = config["description"]
            best_priority = config["priority"]
            best_keywords = matched

    # Confidence scaling
    if best_score == 0:
        confidence = 0.1
    elif best_score < 0.1:
        confidence = 0.3
    else:
        confidence = min(0.95, 0.35 + best_score * 0.6)

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
        if city in text_lower:
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
                 "immediately", "quickly", "fast", "soon", "right now"}

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            if location.lower() in skip_words or len(location) < 3:
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


def _geocode_location(location_name: str) -> Optional[tuple]:
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
