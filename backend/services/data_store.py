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
    """Ambulances are stationed at real hospitals from the registry and
    dispatched toward real accident-risk zones produced by the ML pipeline."""
    from services.hospital_registry import HOSPITALS
    statuses = ["available", "en_route", "on_scene", "critical", "offline"]
    status_weights = [0.5, 0.2, 0.15, 0.05, 0.1]
    rnd = random.Random(7)
    vehicles = []
    for i in range(1, count + 1):
        h = HOSPITALS[(i - 1) % len(HOSPITALS)]
        status = rnd.choices(statuses, weights=status_weights)[0]
        lat = h[4] + rnd.uniform(-0.04, 0.04)
        lng = h[5] + rnd.uniform(-0.04, 0.04)
        moving = status in ("en_route", "critical")
        vehicles.append({
            "id": f"AMB-{i:03d}",
            "name": f"{'ALS' if i % 3 else 'BLS'}-{h[2][:3].upper()}-{i:03d}",
            "lat": lat, "lng": lng, "status": status,
            "speed": rnd.randint(35, 80) if moving else 0,
            "heading": rnd.randint(0, 359),
            "driver": f"Crew {i:03d}",
            "destination": h[1] if moving else "",
            "_home": (h[4], h[5]),
            "_home_name": h[1],
        })
    return vehicles


def _generate_alerts(count: int) -> list[dict]:
    """Alerts derived from ML risk zones (real locations) + live hospital capacity."""
    import json, os
    alerts = []
    zones_path = os.path.join(os.path.dirname(__file__), "..", "ml", "risk_zones.json")
    zones = []
    try:
        with open(zones_path) as f:
            zones = json.load(f)
    except Exception:
        pass
    titles = {
        "High": ["Multi-vehicle collision", "Major trauma incident", "Pedestrian hit — critical"],
        "Medium": ["Two-wheeler collision", "Minor collision — injuries reported", "Vehicle overturned"],
    }
    rnd = random.Random()
    # Incident feed: cities drawn in proportion to their real MoRTH 2022 accident counts
    picks = rnd.choices(zones, weights=[z["accident_count"] for z in zones], k=max(0, count - 6)) if zones else []
    for i, z in enumerate(picks, start=1):
        fr = z.get("fatality_rate") or 0.3
        lvl = "High" if rnd.random() < min(0.9, fr * 1.6) else "Medium"
        sev = "critical" if lvl == "High" else "warning"
        lat = z["lat"] + rnd.uniform(-0.06, 0.06)
        lng = z["lng"] + rnd.uniform(-0.06, 0.06)
        alerts.append({
            "id": f"ALT-{i:03d}", "severity": sev,
            "title": f"{rnd.choice(titles[lvl])} ({z.get('area', 'India')})",
            "location": f"{z.get('area', '')}, {z.get('state', '')} ({lat:.3f}, {lng:.3f})",
            "time": f"{rnd.randint(1, 45)} min ago",
        })
    try:
        from services.hospital_registry import get_alerts as hosp_alerts
        for j, a in enumerate(hosp_alerts(6), start=len(alerts) + 1):
            alerts.append({"id": f"ALT-{j:03d}", "severity": "critical" if a["severity"] == "critical" else "info",
                           "title": f"{a['message']} — {a['hospital']}", "location": a["city"],
                           "time": "live"})
    except Exception:
        pass
    return alerts

# ── Initial vehicle fleet ──
_vehicles: list[dict] = _generate_vehicles(75)

# ── Alerts ──
_alerts: list[dict] = _generate_alerts(20)

def _incidents_today() -> int:
    """Expected accidents so far today across the 53 MoRTH cities:
    2022 annual total / 365, accumulated through the real national time-of-day profile."""
    try:
        from services import real_risk
        card = real_risk.model_card()
        meta = real_risk._meta
        annual = sum(p["accidents_2022"] or 0 for p in meta["city_profiles"].values())
        prof = [card["india_national_time_profile_2018"][s] for s in card["slots"]]
        from services.clock import now_ist
        now = now_ist()
        h = now.hour + now.minute / 60
        done = sum(prof[: int(h // 3)]) + prof[int(h // 3)] * ((h % 3) / 3)
        return int(annual / 365 * done)
    except Exception:
        return 0


def _avg_response_minutes() -> float:
    """Median remaining ETA of units currently responding (distance / 30 km/h).
    Median, so one long inter-city transfer doesn't distort the KPI."""
    import math
    etas = []
    for v in _vehicles:
        if v["status"] in ("en_route", "critical"):
            tlat, tlng = v.get("_target") or v.get("_home", (v["lat"], v["lng"]))
            km = math.hypot((tlat - v["lat"]) * 111, (tlng - v["lng"]) * 111 * math.cos(math.radians(v["lat"])))
            etas.append(km / 0.5)
    if not etas:
        return 0.0
    etas.sort()
    mid = len(etas) // 2
    return round(etas[mid] if len(etas) % 2 else (etas[mid - 1] + etas[mid]) / 2, 1)


def get_dashboard_stats() -> DashboardStats:
    """Compute dashboard summary from current vehicle/alert state."""
    active = sum(1 for v in _vehicles if v["status"] != "offline")
    critical = sum(1 for a in _alerts if a["severity"] == "critical")
    return DashboardStats(
        active_ambulances=active,
        avg_response_time=_avg_response_minutes(),
        incidents_today=_incidents_today(),
        critical_alerts=critical,
    )

def get_alerts() -> list[Alert]:
    """Return all alerts."""
    return [Alert(**a) for a in _alerts]

def get_vehicles() -> list[Vehicle]:
    """Return all vehicles."""
    return [Vehicle(**{k: val for k, val in v.items() if not k.startswith("_")}) for v in _vehicles]

_SIM_TICK_SECONDS = 2.0
_last_sim_tick = 0.0


def tick_simulation() -> None:
    """Advance the shared fleet simulation at most once per tick interval.

    Every WebSocket client and REST poll calls this; the time gate keeps the
    fleet moving at the same speed no matter how many dashboards are open
    (previously each client advanced it, so N tabs moved units N times faster)."""
    global _last_sim_tick
    import time
    now = time.monotonic()
    if now - _last_sim_tick < _SIM_TICK_SECONDS:
        return
    _last_sim_tick = now
    simulate_vehicle_movement()


def simulate_vehicle_movement():
    """
    Slightly move vehicles that are en_route or critical
    to simulate real-time movement. Called by the WebSocket loop.
    🚀 ML UPGRADE: Add realistic behavior loops based on time of day.
    """
    from services.clock import now_ist
    hour = now_ist().hour
    
    is_night = hour < 6 or hour >= 23
    is_peak = (8 <= hour <= 10) or (17 <= hour <= 19)
    
    # Per-tick transition probabilities chosen so the fleet settles at a stable
    # equilibrium (~25% off shift at night, ~7% by day) instead of draining.
    p_off, p_on = (0.003, 0.009) if is_night else (0.0008, 0.010)
    p_incident = 0.004 if is_peak else 0.0015

    for v in _vehicles:
        if v["status"] == "available" and random.random() < p_off:
            v["status"] = "offline"
            continue
        if v["status"] == "offline":
            if random.random() < p_on:
                v["status"] = "available"
            continue

        # New incident near the unit's base hospital (en route, sometimes critical)
        if v["status"] == "available" and random.random() < p_incident:
            hlat, hlng = v.get("_home", (v["lat"], v["lng"]))
            v["_target"] = (hlat + random.uniform(-0.03, 0.03), hlng + random.uniform(-0.03, 0.03))
            v["status"] = "critical" if random.random() < 0.25 else "en_route"
            v["speed"] = random.randint(45, 85)
            v["destination"] = v.get("_home_name", "Incident response")

        if v["status"] in ("en_route", "critical"):
            # Drive toward the destination hospital; slower in peak traffic
            step = 0.0004 if is_peak else 0.0008
            tlat, tlng = v.get("_target") or v.get("_home", (v["lat"], v["lng"]))
            dlat, dlng = tlat - v["lat"], tlng - v["lng"]
            dist = (dlat ** 2 + dlng ** 2) ** 0.5
            if dist < 0.002:
                # Pre-positioning moves end on standby, incident responses on scene
                v["status"] = "available" if v.pop("_reposition", False) else "on_scene"
                v["speed"] = 0
                v.pop("_target", None)
                if v["status"] == "available":
                    v["destination"] = ""
                continue
            import math
            v["lat"] += dlat / dist * step + random.uniform(-0.0001, 0.0001)
            v["lng"] += dlng / dist * step + random.uniform(-0.0001, 0.0001)
            v["heading"] = int((math.degrees(math.atan2(dlng, dlat)) + 360) % 360)
            v["speed"] = max(0, v["speed"] + random.uniform(-5, 5))
            
        elif v["status"] == "on_scene":
            # Occasionally clear a scene
            # Slower clear times at night
            clear_prob = 0.01 if is_night else 0.05
            if random.random() < clear_prob:
                v["status"] = "available"
                v["speed"] = 0
                v["destination"] = ""

def assign_vehicle(vehicle_id: str, destination: str, lat: float, lng: float) -> dict | None:
    """Assign a vehicle to an incident."""
    for v in _vehicles:
        if v["id"] == vehicle_id:
            v["status"] = "en_route"
            v["destination"] = destination
            v["_target"] = (lat, lng)
            v["speed"] = 60 + random.randint(0, 25)
            return v
    return None


def reposition_vehicle(vehicle_id: str, city: str, lat: float, lng: float) -> dict | None:
    """Send an available unit to stand by in another city (fleet pre-positioning)."""
    for v in _vehicles:
        if v["id"] == vehicle_id and v["status"] == "available":
            v["status"] = "en_route"
            v["destination"] = f"Standby: {city}"
            v["_target"] = (lat + random.uniform(-0.01, 0.01), lng + random.uniform(-0.01, 0.01))
            v["_reposition"] = True
            v["speed"] = 70 + random.randint(0, 20)
            return v
    return None
