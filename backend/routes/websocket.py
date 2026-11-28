"""WebSocket /ws — streams live vehicle positions every 2 seconds."""

import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.data_store import get_vehicles, tick_simulation
from db import upsert_vehicle, insert_vehicle_history

router = APIRouter()

# Track connected clients
_connections: list[WebSocket] = []

# Optional: Track last logged positions to avoid spamming the history table if a vehicle is completely stationary
_last_logged_positions = {}


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _connections.append(ws)
    print(f"[OK] WebSocket client connected ({len(_connections)} total)")

    # Background task to consume client messages (like pings) and prevent buffer overflow
    async def _read_from_client():
        try:
            while True:
                data = await ws.receive_text()
                if data == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
        except Exception:
            pass
            
    reader_task = asyncio.create_task(_read_from_client())

    try:
        while True:
            # The reader task ends when the client goes away: stop streaming cleanly
            if reader_task.done():
                raise WebSocketDisconnect()
            # Simulate movement
            tick_simulation()

            # Send updated positions
            vehicles = get_vehicles()
            vehicle_dicts = [v.model_dump() for v in vehicles]
            payload = json.dumps(vehicle_dicts)
            await ws.send_text(payload)
            
            # Persist to Supabase in background to avoid blocking WebSocket
            def _save_db(v_dicts):
                try:
                    for v in v_dicts:
                        upsert_vehicle(v)
                        last = _last_logged_positions.get(v["id"])
                        if not last:
                            should_log = True
                        else:
                            distance = abs(v["lat"] - last["lat"]) + abs(v["lng"] - last["lng"])
                            time_diff = time.time() - last["timestamp"]
                            should_log = (distance > 0.0001) or (last["status"] != v["status"]) or (time_diff > 5.0)
                            
                        if should_log:
                            _last_logged_positions[v["id"]] = {
                                "lat": v["lat"],
                                "lng": v["lng"],
                                "status": v["status"],
                                "timestamp": time.time()
                            }
                            insert_vehicle_history(v)
                except Exception as e:
                    print("DB error:", e)
                    
            asyncio.create_task(asyncio.to_thread(_save_db, vehicle_dicts))

            await asyncio.sleep(2)
    except WebSocketDisconnect:
        print(f"[DISCONNECTED] WebSocket client disconnected ({len(_connections) - 1} remaining)")
    except RuntimeError as e:
        # Sending after the client closed: a normal disconnect race, not an error
        if "websocket.close" in str(e) or "already completed" in str(e):
            print(f"[DISCONNECTED] WebSocket client closed ({len(_connections) - 1} remaining)")
        else:
            print(f"[ERROR] WebSocket error: {e}")
    except Exception as e:
        print(f"[ERROR] WebSocket error: {e}")
    finally:
        reader_task.cancel()
        if ws in _connections:
            _connections.remove(ws)
