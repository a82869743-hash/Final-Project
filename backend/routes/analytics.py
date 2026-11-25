"""Analytics route for tracking and metrics."""

import os
import random
from fastapi import APIRouter

router = APIRouter()

@router.get("/analytics")
def get_analytics():
    try:
        from db import supabase
        
        if not supabase:
            raise Exception("Supabase client not initialized")

        # total dispatches
        dispatches = supabase.table("dispatch_logs").select("id", count="exact").execute()
        total_dispatches = dispatches.count

        # avg ETA
        eta_data = supabase.table("dispatch_logs").select("eta").execute()
        eta_values = [d["eta"] for d in eta_data.data if d.get("eta")]
        avg_eta = round(sum(eta_values) / len(eta_values), 1) if eta_values else 0

        # active vehicles
        # live fleet (the DB table only fills once a WebSocket client is connected)
        from services.data_store import get_vehicles
        active_vehicles = len([v for v in get_vehicles() if v.status != "offline"])

        # high risk zones
        predictions = supabase.table("predictions").select("predicted_level,risk_level").execute()
        high_risk = len([p for p in predictions.data
                         if str(p.get("predicted_level") or p.get("risk_level") or "").lower() in ("high", "critical")])

        # recent dispatches
        recent = supabase.table("dispatch_logs") \
            .select("*") \
            .order("timestamp", desc=True) \
            .limit(5) \
            .execute()

        return {
            "total_dispatches": total_dispatches,
            "avg_eta": avg_eta,
            "active_vehicles": active_vehicles,
            "high_risk_zones": high_risk,
            "recent_dispatches": recent.data
        }

    except Exception as e:
        print("Analytics API using fallback due to DB error:", str(e))
        return {"total_dispatches": 0, "avg_eta": 0, "active_vehicles": 0,
                "high_risk_zones": 0, "recent_dispatches": [], "error": "database unavailable"}
