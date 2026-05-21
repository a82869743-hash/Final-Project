import os
import time

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase_client = None
_supabase_initialized = False

def get_supabase():
    global _supabase_client, _supabase_initialized
    if _supabase_initialized:
        return _supabase_client
    
    _supabase_initialized = True
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            from supabase import create_client, ClientOptions
            _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY, options=ClientOptions(postgrest_client_timeout=10, schema="public"))
        except Exception as e:
            print("Supabase client initialization error:", e)
    else:
        print("Warning: Missing Supabase environment variables. Database logging disabled.")
    
    return _supabase_client

def upsert_vehicle(vehicle: dict):
    client = get_supabase()
    if not client:
        return None
    data = {
        "id": vehicle["id"],
        "lat": vehicle["lat"],
        "lng": vehicle["lng"],
        "status": vehicle["status"],
    }
    response = client.table("vehicles").upsert(data).execute()
    return response

def insert_vehicle_history(vehicle: dict):
    client = get_supabase()
    if not client:
        return None
    data = {
        "vehicle_id": vehicle["id"],
        "lat": vehicle["lat"],
        "lng": vehicle["lng"],
        "status": vehicle["status"],
    }
    return client.table("vehicle_history").insert(data).execute()

def log_dispatch(vehicle: dict, hotspot: dict, prediction: dict, eta: float):
    client = get_supabase()
    if not client:
        return None
        
    try:
        # Sanitize ETA
        eta = max(1, min(60, float(eta))) if eta else None
        eta = round(eta, 1) if eta else None

        data = {
            "vehicle_id": vehicle["id"],
            "hotspot_lat": round(hotspot["lat"], 6),
            "hotspot_lng": round(hotspot["lng"], 6),
            "eta": eta
        }

        return client.table("dispatch_logs").insert(data).execute()
    except Exception as e:
        print("Dispatch log error:", e)
        return None

def count_recent_incidents(lat: float, lng: float, threshold_deg: float = 0.05) -> int:
    """Helper to count how many recent incidents happen around a coordinate"""
    client = get_supabase()
    if not client:
        return 0
    try:
        from datetime import datetime
        now_str = datetime.utcnow().isoformat()
        res = client.table("dispatch_logs").select("hotspot_lat,hotspot_lng").lt("timestamp", now_str).execute()
        if not res.data:
            return 0
            
        count = 0
        for log in res.data:
            d_lat = abs(log["hotspot_lat"] - lat)
            d_lng = abs(log["hotspot_lng"] - lng)
            if d_lat <= threshold_deg and d_lng <= threshold_deg:
                count += 1
        return count
    except Exception as e:
        print("Failed to count incidents:", e)
        return 0

def insert_prediction(data: dict):
    client = get_supabase()
    if not client:
        return None
    try:
        record = {
            "risk_score": data.get("risk_score", 0.0),
            "lat": round(data.get("lat", 0.0), 6),
            "lng": round(data.get("lng", 0.0), 6),
            "time_of_day": data.get("time_of_day", "unknown"),
            "day_of_week": data.get("day_of_week", "unknown"),
            "vehicle_density": data.get("vehicle_density", 0),
            "past_incidents": data.get("past_incidents", 0),
            "weather": data.get("weather", "clear"),
            "predicted_level": data.get("predicted_level", "low"),
            "confidence": data.get("confidence", 0.0),
            "model_version": data.get("model_version", "v2.0"),
            "drift_detected": data.get("drift_detected", False)
        }
        return client.table("predictions").insert(record).execute()
    except Exception as e:
        print("Failed to save prediction:", e)
        return None
