"""
Shared intent -> action routing for /text-intent and /voice-intent.

  emergency / locate_help -> nearest ambulances + hospitals ranked by LIVE bed
                             availability, and (emergency only) auto-dispatch of
                             the nearest available ambulance
  predict_risk            -> real-data risk engine for that location, now
  show_traffic            -> risk + time-of-day profile for the nearest city
"""

from __future__ import annotations

from services.emergency_service import get_emergency_response

NEED_BY_INTENT = {"accident": "emergency", "fire": "burns", "help": "icu"}


def resolve_location(intent: dict, lat: float | None, lng: float | None) -> tuple[float | None, float | None, str, str]:
    loc = intent.get("extracted_location")
    if loc:
        return loc["latitude"], loc["longitude"], loc["name"], "speech"
    if lat is not None and lng is not None:
        intent["extracted_location"] = {"name": "Your location", "latitude": lat, "longitude": lng}
        return lat, lng, "your location", "device-gps"
    return None, None, "unknown location", "none"


def route(intent: dict, lat: float | None = None, lng: float | None = None, auto_dispatch: bool = True) -> dict:
    action = intent.get("action", "none")
    lat, lng, name, source = resolve_location(intent, lat, lng)

    if action in ("emergency", "locate_help", "predict_risk", "show_traffic") and lat is None:
        return {"type": "need_location", "location_source": source,
                "message": "Location not found in the call. Say a place name (e.g. 'near Andheri') "
                           "or allow location access, then try again.",
                "data": None}

    if action in ("emergency", "locate_help"):
        data = get_emergency_response(lat, lng)
        need = NEED_BY_INTENT.get(intent.get("intent", ""), "icu")
        try:
            from services.hospital_registry import recommend
            data["recommended_hospitals"] = recommend(lat, lng, need, 3)
            data["bed_need"] = need
        except Exception:
            data["recommended_hospitals"] = []
        dispatched = None
        amb = data.get("nearest_ambulance")
        if (auto_dispatch and action == "emergency" and amb and amb.get("status") == "available"
                and amb.get("estimated_arrival_min", 999) <= 45):
            from services.data_store import assign_vehicle
            target = (data["recommended_hospitals"] or [{}])[0].get("name", name)
            v = assign_vehicle(amb["vehicle_id"], f"Incident: {name}", lat, lng)
            if v:
                try:
                    from db import log_dispatch
                    log_dispatch({"id": v["id"]}, {"lat": lat, "lng": lng}, {}, amb["estimated_arrival_min"])
                except Exception as e:
                    print("dispatch log error:", e)
                dispatched = {"vehicle_id": v["id"], "name": v["name"], "eta_min": amb["estimated_arrival_min"],
                              "then_to": target}
        data["dispatched"] = dispatched
        try:
            from services.real_risk import assess
            r = assess(lat, lng)
            data["area_risk"] = {"level": r["risk_level"], "percentile": r["percentile"], "city": r["nearest_city"]}
        except Exception:
            pass
        msg = (f"Emergency at {name}: {dispatched['name']} dispatched (ETA {dispatched['eta_min']} min)"
               if dispatched else
               f"{'Emergency' if action == 'emergency' else 'Help'} located for {name}")
        return {"type": "emergency" if action == "emergency" else "help", "message": msg,
                "location_source": source, "data": data}

    if action in ("predict_risk", "show_traffic"):
        from services.real_risk import assess, hourly_profile
        r = assess(lat, lng)
        return {"type": "risk" if action == "predict_risk" else "traffic",
                "message": f"{r['risk_level']} accident risk right now near {name} "
                           f"({r['percentile']:.0f}th percentile, nearest city {r['nearest_city']})",
                "location_source": source,
                "data": {"risk": r, "profile": hourly_profile(r["nearest_city"]),
                         "coordinates": {"latitude": lat, "longitude": lng}}}

    return {"type": "general", "location_source": source,
            "message": "No emergency intent detected. Try: 'accident near Andheri', "
                       "'need an ambulance in Pune', 'is it risky near Delhi now?'",
            "data": {"location": intent.get("extracted_location")}}
