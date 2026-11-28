"""
Hospital Registry + Live Bed Occupancy Engine
=============================================
A registry of real, major Indian hospitals (names and coordinates are
real; bed capacities are approximate public figures), plus a live
telemetry engine that evolves occupancy per ward over time.

Occupancy is a time-driven simulation: a seeded per-hospital baseline,
a diurnal admissions curve (evening/night trauma peaks), and a smooth
random walk. It is consistent between requests (state is kept in
memory) so numbers move gradually rather than jumping on every refresh.
To plug in a real HMIS / state bed portal, replace `_tick()`.
"""

from __future__ import annotations

import math
import random
import threading
import time
from collections import deque
from datetime import datetime, timezone

# id, name, city, state, lat, lng, type, total_beds (approx), trauma_level
HOSPITALS = [
    ("DEL-AIIMS", "AIIMS New Delhi", "Delhi", "Delhi", 28.5672, 77.2100, "Government", 2478, 1),
    ("DEL-SJH", "Safdarjung Hospital", "Delhi", "Delhi", 28.5685, 77.2066, "Government", 2900, 1),
    ("DEL-RML", "Dr. Ram Manohar Lohia Hospital", "Delhi", "Delhi", 28.6264, 77.2002, "Government", 1500, 1),
    ("DEL-LNJP", "Lok Nayak Hospital", "Delhi", "Delhi", 28.6390, 77.2380, "Government", 2000, 1),
    ("DEL-SGRH", "Sir Ganga Ram Hospital", "Delhi", "Delhi", 28.6385, 77.1895, "Private", 675, 2),
    ("DEL-APL", "Indraprastha Apollo Hospital", "Delhi", "Delhi", 28.5410, 77.2830, "Private", 710, 2),
    ("MUM-KEM", "KEM Hospital", "Mumbai", "Maharashtra", 19.0025, 72.8420, "Government", 1800, 1),
    ("MUM-JJ", "Sir J.J. Hospital", "Mumbai", "Maharashtra", 18.9630, 72.8335, "Government", 1352, 1),
    ("MUM-LOK", "Lokmanya Tilak Hospital (Sion)", "Mumbai", "Maharashtra", 19.0390, 72.8610, "Government", 1900, 1),
    ("MUM-KOK", "Kokilaben Dhirubhai Ambani Hospital", "Mumbai", "Maharashtra", 19.1310, 72.8250, "Private", 750, 2),
    ("MUM-TMH", "Tata Memorial Hospital", "Mumbai", "Maharashtra", 19.0045, 72.8430, "Government", 700, 3),
    ("BLR-VIC", "Victoria Hospital", "Bengaluru", "Karnataka", 12.9600, 77.5730, "Government", 1000, 1),
    ("BLR-NIM", "NIMHANS", "Bengaluru", "Karnataka", 12.9430, 77.5960, "Government", 900, 2),
    ("BLR-MAN", "Manipal Hospital Old Airport Rd", "Bengaluru", "Karnataka", 12.9590, 77.6480, "Private", 600, 2),
    ("CHE-RGG", "Rajiv Gandhi Govt General Hospital", "Chennai", "Tamil Nadu", 13.0810, 80.2770, "Government", 2722, 1),
    ("CHE-STN", "Govt Stanley Hospital", "Chennai", "Tamil Nadu", 13.1060, 80.2870, "Government", 1450, 1),
    ("CHE-APL", "Apollo Hospitals Greams Road", "Chennai", "Tamil Nadu", 13.0630, 80.2510, "Private", 560, 2),
    ("KOL-SSKM", "SSKM Hospital", "Kolkata", "West Bengal", 22.5390, 88.3440, "Government", 2000, 1),
    ("KOL-MCH", "Medical College Kolkata", "Kolkata", "West Bengal", 22.5740, 88.3630, "Government", 1800, 1),
    ("HYD-OGH", "Osmania General Hospital", "Hyderabad", "Telangana", 17.3720, 78.4740, "Government", 1168, 1),
    ("HYD-NIMS", "NIMS Hyderabad", "Hyderabad", "Telangana", 17.4210, 78.4510, "Government", 1500, 1),
    ("HYD-GAN", "Gandhi Hospital", "Hyderabad", "Telangana", 17.4250, 78.5030, "Government", 1890, 1),
    ("AMD-CIV", "Civil Hospital Ahmedabad", "Ahmedabad", "Gujarat", 23.0530, 72.6030, "Government", 2800, 1),
    ("AMD-SVP", "SVP Hospital", "Ahmedabad", "Gujarat", 23.0230, 72.5650, "Government", 1500, 1),
    ("VAD-SSG", "SSG Hospital", "Vadodara", "Gujarat", 22.3110, 73.1880, "Government", 1650, 1),
    ("SUR-NCH", "New Civil Hospital Surat", "Surat", "Gujarat", 21.1820, 72.8170, "Government", 1500, 1),
    ("PUN-SAS", "Sassoon General Hospital", "Pune", "Maharashtra", 18.5280, 73.8730, "Government", 1296, 1),
    ("PUN-RUB", "Ruby Hall Clinic", "Pune", "Maharashtra", 18.5330, 73.8770, "Private", 750, 2),
    ("JAI-SMS", "SMS Hospital", "Jaipur", "Rajasthan", 26.9050, 75.8150, "Government", 2500, 1),
    ("LKO-KGMU", "KGMU Trauma Centre", "Lucknow", "Uttar Pradesh", 26.8690, 80.9160, "Government", 4000, 1),
    ("LKO-SGPGI", "SGPGIMS", "Lucknow", "Uttar Pradesh", 26.7440, 80.9370, "Government", 1600, 2),
    ("KNP-LLR", "LLR Hospital (Hallet)", "Kanpur", "Uttar Pradesh", 26.4800, 80.3060, "Government", 1400, 1),
    ("NAG-GMC", "GMC Nagpur", "Nagpur", "Maharashtra", 21.1360, 79.0990, "Government", 1400, 1),
    ("IND-MYH", "MY Hospital", "Indore", "Madhya Pradesh", 22.7150, 75.8820, "Government", 1200, 1),
    ("BPL-HMD", "Hamidia Hospital", "Bhopal", "Madhya Pradesh", 23.2600, 77.3950, "Government", 1400, 1),
    ("BPL-AIIMS", "AIIMS Bhopal", "Bhopal", "Madhya Pradesh", 23.2080, 77.4600, "Government", 960, 1),
    ("PAT-PMCH", "PMCH Patna", "Patna", "Bihar", 25.6200, 85.1580, "Government", 1750, 1),
    ("CHD-PGI", "PGIMER Chandigarh", "Chandigarh", "Chandigarh", 30.7640, 76.7750, "Government", 2200, 1),
    ("RPR-AIIMS", "AIIMS Raipur", "Raipur", "Chhattisgarh", 21.2580, 81.5790, "Government", 960, 1),
    ("GUW-GMCH", "Gauhati Medical College Hospital", "Guwahati", "Assam", 26.1560, 91.7700, "Government", 2100, 1),
    ("KOC-AIMS", "Amrita Institute (AIMS) Kochi", "Kochi", "Kerala", 10.0330, 76.2930, "Private", 1350, 1),
    ("VSK-KGH", "King George Hospital", "Visakhapatnam", "Andhra Pradesh", 17.7090, 83.3010, "Government", 1500, 1),
]

# Ward mix as share of total beds, plus baseline occupancy
WARDS = {
    "icu":         {"label": "ICU",              "share": 0.08, "base": 0.86, "critical": True},
    "ventilator":  {"label": "Ventilators",      "share": 0.03, "base": 0.72, "critical": True},
    "hdu":         {"label": "HDU / Step-down",  "share": 0.05, "base": 0.80, "critical": True},
    "emergency":   {"label": "Emergency / Trauma", "share": 0.06, "base": 0.78, "critical": True},
    "general":     {"label": "General Ward",     "share": 0.55, "base": 0.74, "critical": False},
    "pediatric":   {"label": "Pediatric",        "share": 0.08, "base": 0.65, "critical": False},
    "maternity":   {"label": "Maternity",        "share": 0.08, "base": 0.68, "critical": False},
    "isolation":   {"label": "Isolation",        "share": 0.04, "base": 0.40, "critical": False},
    "burns":       {"label": "Burns Unit",       "share": 0.03, "base": 0.62, "critical": True},
}

TICK_SECONDS = 5
HISTORY_POINTS = 48  # ~4 min at 5s ticks shown as trend

_lock = threading.Lock()
_state: dict[str, dict] = {}
_last_tick = 0.0
_city_history: deque = deque(maxlen=HISTORY_POINTS)


def _haversine(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _diurnal(hour: float) -> float:
    """Load multiplier: peaks ~21:00 (trauma), trough ~05:00."""
    return 1.0 + 0.06 * math.sin((hour - 15) / 24 * 2 * math.pi)


def _init():
    for hid, name, city, state, lat, lng, htype, beds, level in HOSPITALS:
        rnd = random.Random(hid)
        wards = {}
        for key, cfg in WARDS.items():
            cap = max(4, int(beds * cfg["share"]))
            if key == "ventilator":
                cap = max(4, int(beds * cfg["share"] * (1.3 if level == 1 else 0.9)))
            bias = rnd.uniform(-0.08, 0.08) + (0.04 if htype == "Government" else -0.03)
            wards[key] = {"capacity": cap, "rate": min(0.98, max(0.2, cfg["base"] + bias))}
        _state[hid] = {
            "meta": dict(id=hid, name=name, city=city, state=state, lat=lat, lng=lng,
                         type=htype, total_beds=beds, trauma_level=level),
            "wards": wards,
            "oxygen_pct": rnd.uniform(62, 95),
            "blood_units": rnd.randint(80, 600),
            "doctors_on_duty": max(8, int(beds / rnd.uniform(18, 30))),
            "er_wait_min": rnd.uniform(8, 40),
            "admissions_hr": 0.0, "discharges_hr": 0.0,
            "incoming_ambulances": 0,
            "history": deque(maxlen=HISTORY_POINTS),
        }


def _tick():
    """Advance the simulation by however many ticks elapsed."""
    global _last_tick
    now = time.time()
    if not _state:
        _init()
    steps = 1 if _last_tick == 0 else min(30, int((now - _last_tick) // TICK_SECONDS))
    if steps <= 0:
        return
    _last_tick = now
    from services.clock import now_ist
    _n = now_ist()
    hour = _n.hour + _n.minute / 60
    load = _diurnal(hour)
    for _ in range(steps):
        tot_occ = tot_cap = 0
        for s in _state.values():
            for key, w in s["wards"].items():
                target = min(0.99, WARDS[key]["base"] * load)
                # mean-reverting random walk
                w["rate"] += 0.08 * (target - w["rate"]) + random.gauss(0, 0.012)
                # occasional surge (mass-casualty / trauma influx)
                if WARDS[key]["critical"] and random.random() < 0.004:
                    w["rate"] += random.uniform(0.05, 0.12)
                w["rate"] = min(1.0, max(0.15, w["rate"]))
            s["oxygen_pct"] = min(100, max(18, s["oxygen_pct"] - random.uniform(0.05, 0.35)
                                           + (random.uniform(25, 40) if s["oxygen_pct"] < 30 and random.random() < 0.3 else 0)))
            s["blood_units"] = max(10, s["blood_units"] + random.randint(-6, 5))
            s["er_wait_min"] = max(3, s["er_wait_min"] + random.gauss(0, 1.5) + (load - 1) * 4)
            beds = s["meta"]["total_beds"]
            s["admissions_hr"] = max(0, beds * 0.012 * load + random.gauss(0, 2))
            s["discharges_hr"] = max(0, beds * 0.011 + random.gauss(0, 2))
            s["incoming_ambulances"] = max(0, min(12, s["incoming_ambulances"] + random.choice([-1, 0, 0, 1])))
            occ = sum(int(w["capacity"] * w["rate"]) for w in s["wards"].values())
            cap = sum(w["capacity"] for w in s["wards"].values())
            icu = s["wards"]["icu"]
            s["history"].append({"t": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                                 "occupancy": round(occ / cap * 100, 1),
                                 "icu": round(icu["rate"] * 100, 1)})
            tot_occ += occ; tot_cap += cap
        _city_history.append({"t": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                              "occupancy": round(tot_occ / max(tot_cap, 1) * 100, 1)})


def _status(pct: float) -> str:
    return "critical" if pct >= 92 else "high" if pct >= 80 else "moderate" if pct >= 60 else "normal"


def _snapshot(s: dict, include_history: bool = False) -> dict:
    wards = {}
    occ_total = cap_total = 0
    for key, w in s["wards"].items():
        occupied = min(w["capacity"], int(w["capacity"] * w["rate"]))
        pct = occupied / w["capacity"] * 100
        wards[key] = {"label": WARDS[key]["label"], "capacity": w["capacity"], "occupied": occupied,
                      "available": w["capacity"] - occupied, "occupancy_pct": round(pct, 1),
                      "status": _status(pct), "critical_care": WARDS[key]["critical"]}
        occ_total += occupied; cap_total += w["capacity"]
    pct = occ_total / cap_total * 100
    crit = [wards[k] for k in wards if WARDS[k]["critical"]]
    crit_avail = sum(w["available"] for w in crit)
    icu_pct = wards["icu"]["occupancy_pct"]
    # can it accept a critical trauma patient right now?
    accepting = wards["icu"]["available"] > 0 and wards["emergency"]["available"] > 0 and s["oxygen_pct"] > 25
    out = {
        **s["meta"],
        "wards": wards,
        "occupied_beds": occ_total, "capacity_beds": cap_total,
        "available_beds": cap_total - occ_total, "occupancy_pct": round(pct, 1),
        "critical_beds_available": crit_avail,
        "status": _status(max(pct, icu_pct)),
        "accepting_critical": accepting,
        "oxygen_pct": round(s["oxygen_pct"], 1),
        "blood_units": s["blood_units"],
        "doctors_on_duty": s["doctors_on_duty"],
        "er_wait_min": round(s["er_wait_min"]),
        "admissions_hr": round(s["admissions_hr"], 1),
        "discharges_hr": round(s["discharges_hr"], 1),
        "incoming_ambulances": s["incoming_ambulances"],
    }
    if include_history:
        out["history"] = list(s["history"])
    return out


def list_hospitals(city: str | None = None) -> list[dict]:
    with _lock:
        _tick()
        items = [_snapshot(s) for s in _state.values()
                 if not city or s["meta"]["city"].lower() == city.lower()]
    return sorted(items, key=lambda h: -h["occupancy_pct"])


def get_hospital(hid: str) -> dict | None:
    with _lock:
        _tick()
        s = _state.get(hid)
        return _snapshot(s, include_history=True) if s else None


def get_summary() -> dict:
    hospitals = list_hospitals()
    agg: dict[str, dict] = {}
    for h in hospitals:
        for key, w in h["wards"].items():
            a = agg.setdefault(key, {"label": w["label"], "capacity": 0, "occupied": 0,
                                     "critical_care": w["critical_care"]})
            a["capacity"] += w["capacity"]; a["occupied"] += w["occupied"]
    for a in agg.values():
        a["available"] = a["capacity"] - a["occupied"]
        a["occupancy_pct"] = round(a["occupied"] / a["capacity"] * 100, 1)
        a["status"] = _status(a["occupancy_pct"])
    cities: dict[str, dict] = {}
    for h in hospitals:
        c = cities.setdefault(h["city"], {"city": h["city"], "hospitals": 0, "capacity": 0,
                                          "occupied": 0, "icu_available": 0})
        c["hospitals"] += 1; c["capacity"] += h["capacity_beds"]; c["occupied"] += h["occupied_beds"]
        c["icu_available"] += h["wards"]["icu"]["available"]
    for c in cities.values():
        c["occupancy_pct"] = round(c["occupied"] / c["capacity"] * 100, 1)
    cap = sum(h["capacity_beds"] for h in hospitals)
    occ = sum(h["occupied_beds"] for h in hospitals)
    with _lock:
        trend = list(_city_history)
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_hospitals": len(hospitals),
        "total_beds": cap, "occupied_beds": occ, "available_beds": cap - occ,
        "occupancy_pct": round(occ / cap * 100, 1),
        "icu_available": agg["icu"]["available"],
        "ventilators_available": agg["ventilator"]["available"],
        "critical_beds_available": sum(a["available"] for a in agg.values() if a["critical_care"]),
        "hospitals_on_diversion": sum(1 for h in hospitals if not h["accepting_critical"]),
        "incoming_ambulances": sum(h["incoming_ambulances"] for h in hospitals),
        "wards": agg,
        "cities": sorted(cities.values(), key=lambda c: -c["occupancy_pct"]),
        "trend": trend,
        "data_mode": "simulated-live",
    }


def get_alerts(limit: int = 25) -> list[dict]:
    alerts = []
    for h in list_hospitals():
        if not h["accepting_critical"]:
            alerts.append({"severity": "critical", "hospital": h["name"], "city": h["city"],
                           "message": "On diversion — not accepting critical trauma"})
        for key in ("icu", "ventilator", "emergency"):
            w = h["wards"][key]
            if w["occupancy_pct"] >= 95:
                alerts.append({"severity": "critical", "hospital": h["name"], "city": h["city"],
                               "message": f"{w['label']} at {w['occupancy_pct']}% ({w['available']} free)"})
            elif w["occupancy_pct"] >= 88:
                alerts.append({"severity": "warning", "hospital": h["name"], "city": h["city"],
                               "message": f"{w['label']} nearing capacity ({w['occupancy_pct']}%)"})
        if h["oxygen_pct"] < 30:
            alerts.append({"severity": "critical", "hospital": h["name"], "city": h["city"],
                           "message": f"Oxygen reserve low ({h['oxygen_pct']}%)"})
        if h["blood_units"] < 60:
            alerts.append({"severity": "warning", "hospital": h["name"], "city": h["city"],
                           "message": f"Blood bank low ({h['blood_units']} units)"})
    order = {"critical": 0, "warning": 1}
    return sorted(alerts, key=lambda a: order[a["severity"]])[:limit]


def recommend(lat: float, lng: float, need: str = "icu", top_n: int = 5) -> list[dict]:
    """Best hospitals for a patient: distance + availability of the needed ward + ER wait."""
    out = []
    for h in list_hospitals():
        d = _haversine(lat, lng, h["lat"], h["lng"])
        if d > 150:
            continue
        ward = h["wards"].get(need, h["wards"]["icu"])
        eta = d / 35 * 60  # ~35 km/h urban ambulance average
        score = eta + h["er_wait_min"] * 0.5 + (60 if ward["available"] == 0 else 0) \
            + (40 if not h["accepting_critical"] else 0) - min(ward["available"], 20)
        out.append({"id": h["id"], "name": h["name"], "city": h["city"], "lat": h["lat"], "lng": h["lng"],
                    "distance_km": round(d, 1), "eta_min": round(eta), "need": need,
                    "ward_available": ward["available"], "er_wait_min": h["er_wait_min"],
                    "accepting_critical": h["accepting_critical"], "score": round(score, 1)})
    return sorted(out, key=lambda x: x["score"])[:top_n]


def nearest_hospitals(lat: float, lng: float, top_n: int = 3) -> list[dict]:
    """Shape compatible with emergency_service.find_nearest_hospital."""
    res = []
    for h in sorted(list_hospitals(), key=lambda h: _haversine(lat, lng, h["lat"], h["lng"]))[:top_n]:
        res.append({"hospital_id": h["id"], "hospital_name": h["name"], "city": h["city"],
                    "latitude": h["lat"], "longitude": h["lng"],
                    "distance_km": round(_haversine(lat, lng, h["lat"], h["lng"]), 2),
                    "total_beds": h["total_beds"], "icu_beds": h["wards"]["icu"]["capacity"],
                    "available_beds": h["available_beds"],
                    "has_emergency": "Yes" if h["accepting_critical"] else "Diversion",
                    "has_ambulance": "Yes"})
    return res
