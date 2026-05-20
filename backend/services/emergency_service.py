"""
Emergency Response Service
===========================
Finds the nearest ambulance and hospital using real CSV datasets
and Haversine distance calculations.

Uses:
    - gps_ambulance_large_dataset.csv  → ambulance GPS positions
    - india_hospital_large_dataset.csv → hospital locations & capabilities
"""

import os
import math
import pandas as pd
from typing import Optional

# ── Paths ──
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

AMBULANCE_CSV = os.path.join(PROJECT_ROOT, "gps_ambulance_large_dataset.csv")
HOSPITAL_CSV = os.path.join(PROJECT_ROOT, "india_hospital_large_dataset.csv")

# ── In-memory cache ──
_ambulance_data: Optional[pd.DataFrame] = None
_hospital_data: Optional[pd.DataFrame] = None


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km using Haversine formula."""
    R = 6371.0  # Earth's radius in km
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _load_ambulance_data() -> pd.DataFrame:
    """Load and cache ambulance GPS data."""
    global _ambulance_data
    if _ambulance_data is not None:
        return _ambulance_data

    if not os.path.exists(AMBULANCE_CSV):
        print(f"[WARNING] Ambulance CSV not found: {AMBULANCE_CSV}")
        _ambulance_data = pd.DataFrame()
        return _ambulance_data

    df = pd.read_csv(AMBULANCE_CSV)
    df.dropna(subset=["latitude", "longitude"], inplace=True)

    # Keep only the latest position per vehicle
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df = df.sort_values("timestamp", ascending=False)
        df = df.drop_duplicates(subset=["vehicle_id"], keep="first")

    _ambulance_data = df
    print(f"[OK] Loaded {len(df)} ambulance positions from CSV")
    return _ambulance_data


def _load_hospital_data() -> pd.DataFrame:
    """Load and cache hospital location data."""
    global _hospital_data
    if _hospital_data is not None:
        return _hospital_data

    if not os.path.exists(HOSPITAL_CSV):
        print(f"[WARNING] Hospital CSV not found: {HOSPITAL_CSV}")
        _hospital_data = pd.DataFrame()
        return _hospital_data

    df = pd.read_csv(HOSPITAL_CSV)
    df.dropna(subset=["latitude", "longitude"], inplace=True)

    _hospital_data = df
    print(f"[OK] Loaded {len(df)} hospital records from CSV")
    return _hospital_data


def find_nearest_ambulance(lat: float, lng: float, top_n: int = 1) -> list[dict]:
    """
    Find the nearest ambulance(s) to a given coordinate.
    Returns a list of dicts with ambulance info and distance.
    Caps search to 100km radius for geographic relevance.
    """
    df = _load_ambulance_data()
    if df.empty:
        return [_mock_ambulance(lat, lng)]

    df = df.copy()
    df["distance_km"] = df.apply(
        lambda row: _haversine(lat, lng, row["latitude"], row["longitude"]),
        axis=1
    )

    # Cap to ambulances within 100 km for relevance
    nearby = df[df["distance_km"] <= 100.0]
    if nearby.empty:
        nearby = df  # fallback to all if none within 100km

    # Prefer available/idle ambulances
    status_priority = {"available": 0, "idle": 0, "on_route": 1, "busy": 2}
    if "status" in nearby.columns:
        nearby = nearby.copy()
        nearby["priority"] = nearby["status"].map(status_priority).fillna(1)
        nearby = nearby.sort_values(["priority", "distance_km"])
    else:
        nearby = nearby.sort_values("distance_km")

    results = []
    for _, row in nearby.head(top_n).iterrows():
        results.append({
            "vehicle_id": str(row.get("vehicle_id", "AMB-UNKNOWN")),
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
            "status": str(row.get("status", "available")),
            "distance_km": round(float(row["distance_km"]), 2),
            "estimated_arrival_min": round(float(row["distance_km"]) / 0.5, 1)  # ~30 km/h avg city speed
        })

    return results


## ── Known Indian city coordinates for reverse-geocoding ──
_KNOWN_CITIES = {
    "Mumbai": (19.0760, 72.8777), "Delhi": (28.6139, 77.2090),
    "Bangalore": (12.9716, 77.5946), "Hyderabad": (17.3850, 78.4867),
    "Ahmedabad": (23.0225, 72.5714), "Chennai": (13.0827, 80.2707),
    "Kolkata": (22.5726, 88.3639), "Pune": (18.5204, 73.8567),
    "Jaipur": (26.9124, 75.7873), "Surat": (21.1702, 72.8311),
    "Lucknow": (26.8467, 80.9462), "Kanpur": (26.4499, 80.3319),
    "Nagpur": (21.1458, 79.0882), "Indore": (22.7196, 75.8577),
    "Bhopal": (23.2599, 77.4126), "Vadodara": (22.3072, 73.1812),
    "Patna": (25.6093, 85.1376), "Guwahati": (26.1445, 91.7362),
    "Chandigarh": (30.7333, 76.7794), "Kochi": (9.9312, 76.2673),
    "Coimbatore": (11.0168, 76.9558), "Bhubaneswar": (20.2961, 85.8245),
    "Varanasi": (25.3176, 82.9739), "Ranchi": (23.3441, 85.3096),
    "Goa": (15.2993, 74.1240), "Visakhapatnam": (17.6868, 83.2185),
    "Nashik": (19.9975, 73.7898), "Agra": (27.1767, 78.0081),
    "Rajkot": (22.3039, 70.8022), "Jodhpur": (26.2389, 73.0243),
    "Raipur": (21.2514, 81.6296), "Thiruvananthapuram": (8.5241, 76.9366),
    "Mangalore": (12.9141, 74.8560), "Amritsar": (31.6340, 74.8723),
    "Dehradun": (30.3165, 78.0322), "Udaipur": (24.5854, 73.7125),
}

def _nearest_city_name(lat: float, lng: float) -> str:
    """Reverse-geocode to the nearest known Indian city name."""
    best_name, best_dist = "Unknown", float("inf")
    for name, (clat, clng) in _KNOWN_CITIES.items():
        d = _haversine(lat, lng, clat, clng)
        if d < best_dist:
            best_dist = d
            best_name = name
    return best_name


def find_nearest_hospital(lat: float, lng: float, top_n: int = 1,
                          require_emergency: bool = False) -> list[dict]:
    """
    Find the nearest hospital(s) to a given coordinate.
    Optionally filter to only hospitals with emergency facilities.
    Uses coordinate-based reverse geocoding for city names instead of
    the CSV's inaccurate city column.
    """
    df = _load_hospital_data()
    if df.empty:
        return [_mock_hospital(lat, lng)]

    df = df.copy()

    # Filter emergency if required
    if require_emergency and "emergency_facility" in df.columns:
        emergency_df = df[df["emergency_facility"].str.lower() == "yes"]
        if not emergency_df.empty:
            df = emergency_df

    df["distance_km"] = df.apply(
        lambda row: _haversine(lat, lng, row["latitude"], row["longitude"]),
        axis=1
    )

    # Cap to hospitals within 100 km for relevance
    nearby = df[df["distance_km"] <= 100.0]
    if nearby.empty:
        nearby = df  # fallback to all if none within 100km

    nearby = nearby.sort_values("distance_km")

    results = []
    for _, row in nearby.head(top_n).iterrows():
        # Use coordinate-based city instead of CSV's wrong city column
        actual_city = _nearest_city_name(float(row["latitude"]), float(row["longitude"]))
        results.append({
            "hospital_id": int(row.get("hospital_id", 0)),
            "hospital_name": str(row.get("hospital_name", "Unknown Hospital")),
            "city": actual_city,
            "latitude": round(float(row["latitude"]), 6),
            "longitude": round(float(row["longitude"]), 6),
            "distance_km": round(float(row["distance_km"]), 2),
            "total_beds": int(row.get("total_beds", 0)),
            "icu_beds": int(row.get("icu_beds", 0)),
            "available_beds": int(row.get("available_beds", 0)),
            "has_emergency": str(row.get("emergency_facility", "Unknown")),
            "has_ambulance": str(row.get("ambulance_available", "Unknown")),
        })

    return results


def get_emergency_response(lat: float, lng: float) -> dict:
    """
    Full emergency response: find nearest ambulance AND nearest hospital.
    Returns comprehensive response data.
    """
    ambulances = find_nearest_ambulance(lat, lng, top_n=3)
    hospitals = find_nearest_hospital(lat, lng, top_n=3, require_emergency=True)

    return {
        "nearest_ambulance": ambulances[0] if ambulances else None,
        "nearest_hospital": hospitals[0] if hospitals else None,
        "all_nearby_ambulances": ambulances,
        "all_nearby_hospitals": hospitals,
        "incident_location": {"latitude": lat, "longitude": lng},
    }


# ── Fallback mocks ──

def _mock_ambulance(lat: float, lng: float) -> dict:
    return {
        "vehicle_id": "AMB-MOCK-01",
        "latitude": round(lat + 0.01, 6),
        "longitude": round(lng + 0.01, 6),
        "status": "available",
        "distance_km": 1.5,
        "estimated_arrival_min": 3.0,
    }


def _mock_hospital(lat: float, lng: float) -> dict:
    return {
        "hospital_id": 0,
        "hospital_name": "General Hospital (Mock)",
        "city": "Unknown",
        "latitude": round(lat + 0.02, 6),
        "longitude": round(lng + 0.02, 6),
        "distance_km": 3.0,
        "total_beds": 200,
        "icu_beds": 20,
        "available_beds": 50,
        "has_emergency": "Yes",
        "has_ambulance": "Yes",
    }
