"""
In-memory data store with realistic mock data.
Provides vehicle positions, alerts, and dashboard stats.
In production, these would come from Supabase.
"""

import random
from datetime import datetime
from models.schemas import Vehicle, Alert, DashboardStats

INDIAN_CITIES = {
    "Delhi": {"lat": 28.6139, "lng": 77.2090},
    "Mumbai": {"lat": 19.0760, "lng": 72.8777},
    "Bangalore": {"lat": 12.9716, "lng": 77.5946},
    "Chennai": {"lat": 13.0827, "lng": 80.2707},
    "Kolkata": {"lat": 22.5726, "lng": 88.3639},
    "Hyderabad": {"lat": 17.3850, "lng": 78.4867},
    "Ahmedabad": {"lat": 23.0225, "lng": 72.5714},
    "Pune": {"lat": 18.5204, "lng": 73.8567},
    "Jaipur": {"lat": 26.9124, "lng": 75.7873},
    "Surat": {"lat": 21.1702, "lng": 72.8311},
    "Lucknow": {"lat": 26.8467, "lng": 80.9462},
    "Kanpur": {"lat": 26.4499, "lng": 80.3319},
    "Nagpur": {"lat": 21.1458, "lng": 79.0882},
    "Indore": {"lat": 22.7196, "lng": 75.8577},
    "Bhopal": {"lat": 23.2599, "lng": 77.4126},
}

def _generate_vehicles(count: int) -> list[dict]:
    vehicles = []
    cities = list(INDIAN_CITIES.keys())
    statuses = ["available", "en_route", "on_scene", "critical", "offline"]
    status_weights = [0.5, 0.2, 0.15, 0.05, 0.1]
    
    for i in range(1, count + 1):
        city = random.choice(cities)
        base_lat = INDIAN_CITIES[city]["lat"]
        base_lng = INDIAN_CITIES[city]["lng"]
        
        # Add random jitter for realistic city spread (~10-20km)
        lat = base_lat + random.uniform(-0.15, 0.15)
        lng = base_lng + random.uniform(-0.15, 0.15)
        
        status = random.choices(statuses, weights=status_weights)[0]
        speed = 0
        if status in ["en_route", "critical"]:
            speed = random.randint(40, 90)
            
        vehicles.append({
            "id": f"AMB-{i:03d}",
            "name": f"Unit-{i:03d}",
            "lat": lat,
            "lng": lng,
            "status": status,
            "speed": speed,
            "heading": random.randint(0, 359),
            "driver": f"Driver-{i}",
            "destination": f"Hospital {city}" if status in ["en_route", "critical"] else ""
        })
    return vehicles

def _generate_alerts(count: int) -> list[dict]:
    alerts = []
    cities = list(INDIAN_CITIES.keys())
    severities = ["critical", "warning", "info"]
    severity_weights = [0.3, 0.5, 0.2]
    
    titles = {
        "critical": ["Multi-vehicle collision", "Cardiac arrest reported", "Major trauma incident", "Severe burn emergency"],
        "warning": ["Delayed response time", "High traffic zone - reroute", "Oxygen supply low", "Minor collision"],
        "info": ["Maintenance due", "Shift change", "Routine patrol", "Unit restocked"]
    }
    
    for i in range(1, count + 1):
        city = random.choice(cities)
        severity = random.choices(severities, weights=severity_weights)[0]
        title = random.choice(titles[severity])
        minutes_ago = random.randint(1, 45)
        
        alerts.append({
            "id": f"ALT-{i:03d}",
            "severity": severity,
            "title": f"{title} ({city})",
            "location": f"Sector {random.randint(1,20)}, {city}",
            "time": f"{minutes_ago} min ago"
        })
    return alerts

# ── Initial vehicle fleet ──
_vehicles: list[dict] = _generate_vehicles(75)

# ── Alerts ──
_alerts: list[dict] = _generate_alerts(20)

def get_dashboard_stats() -> DashboardStats:
    """Compute dashboard summary from current vehicle/alert state."""
    active = sum(1 for v in _vehicles if v["status"] != "offline")
    critical = sum(1 for a in _alerts if a["severity"] == "critical")
    return DashboardStats(
        active_ambulances=active,
        avg_response_time=round(3.8 + random.uniform(-0.5, 0.5), 1),
        incidents_today=150 + random.randint(0, 30), # Scaled up for Pan-India
        critical_alerts=critical,
    )

def get_alerts() -> list[Alert]:
    """Return all alerts."""
    return [Alert(**a) for a in _alerts]

def get_vehicles() -> list[Vehicle]:
    """Return all vehicles."""
    return [Vehicle(**v) for v in _vehicles]

def simulate_vehicle_movement():
    """
    Slightly move vehicles that are en_route or critical
    to simulate real-time movement. Called by the WebSocket loop.
    🚀 ML UPGRADE: Add realistic behavior loops based on time of day.
    """
    now = datetime.utcnow()
    hour = now.hour
    
    is_night = hour < 6 or hour >= 23
    is_peak = (8 <= hour <= 10) or (17 <= hour <= 19)
    
    for v in _vehicles:
        # Simulate offline states dropping at night, coming back in day
        if is_night and v["status"] == "available" and random.random() < 0.05:
            v["status"] = "offline"
        elif not is_night and v["status"] == "offline" and random.random() < 0.2:
            v["status"] = "available"
            
        # Simulate huge incident spikes during peak hours affecting available units
        if is_peak and v["status"] == "available" and random.random() < 0.02:
            v["status"] = "critical"
            v["speed"] = random.randint(60, 90)
            
        if v["status"] in ("en_route", "critical"):
            # Speed constraints based on time context (slower at peak, faster at night)
            if is_peak:
                v["lat"] += random.uniform(-0.0004, 0.0004) # Slower movement
                v["lng"] += random.uniform(-0.0004, 0.0004)
            else:
                v["lat"] += random.uniform(-0.0008, 0.0008) # Normal/fast movement
                v["lng"] += random.uniform(-0.0008, 0.0008)
                
            v["speed"] = max(0, v["speed"] + random.uniform(-5, 5))
            
        elif v["status"] == "on_scene":
            # Occasionally clear a scene
            # Slower clear times at night
            clear_prob = 0.01 if is_night else 0.05
            if random.random() < clear_prob:
                v["status"] = "available"
                v["speed"] = 0

def assign_vehicle(vehicle_id: str, destination: str, lat: float, lng: float) -> dict | None:
    """Assign a vehicle to an incident."""
    for v in _vehicles:
        if v["id"] == vehicle_id:
            v["status"] = "en_route"
            v["destination"] = destination
            v["speed"] = 60 + random.randint(0, 25)
            return v
    return None
