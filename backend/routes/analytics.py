"""Analytics route for tracking and metrics."""

from fastapi import APIRouter

router = APIRouter()


def _live_counts() -> tuple[int, int]:
    """(active vehicles, cities at High risk right now) from live state, no DB needed."""
    from services.data_store import get_vehicles
    active = len([v for v in get_vehicles() if v.status != "offline"])
    try:
        from services import demand, real_risk, weather
        from services.clock import now_ist
        snap, hour = weather.snapshot(), now_ist().hour
        high = sum(
            1 for name, c in demand.model()["cities"].items()
            if real_risk.assess(c["lat"], c["lng"], hour=hour,
                                weather=snap["cities"].get(name, {}).get("weather_class", 0))["risk_level"] == "High")
    except Exception as e:
        print("Analytics: live risk unavailable:", e)
        high = 0
    return active, high

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

        # live fleet + cities currently in the top-15% risk band (real-data engine)
        active_vehicles, high_risk = _live_counts()

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
        active_vehicles, high_risk = _live_counts()
        return {"total_dispatches": 0, "avg_eta": 0, "active_vehicles": active_vehicles,
                "high_risk_zones": high_risk, "recent_dispatches": [], "error": "database unavailable"}
