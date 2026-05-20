"""
Aegis Tactical — Video WebSocket Broadcaster
=============================================
Separate WebSocket endpoint for video intelligence alerts.
Does NOT modify the existing /ws vehicle tracking endpoint.
"""

import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("aegis.video_ws")

router = APIRouter()

# Video alert subscribers (separate from vehicle WS)
_video_connections: list[WebSocket] = []


async def broadcast_video_alert(alert: dict):
    """
    Broadcast a VIDEO_ALERT to all connected video WebSocket clients.
    Called from the video analysis pipeline when confidence > threshold.
    Fails silently if no clients are connected.
    """
    if not _video_connections:
        return

    payload = json.dumps(alert)
    disconnected = []

    for ws in _video_connections:
        try:
            await ws.send_text(payload)
        except Exception:
            disconnected.append(ws)

    for ws in disconnected:
        if ws in _video_connections:
            _video_connections.remove(ws)


@router.websocket("/ws/video")
async def video_websocket_endpoint(ws: WebSocket):
    """
    WebSocket endpoint for real-time video intelligence alerts.
    Clients connect here to receive VIDEO_ALERT events when
    high-confidence emergency events are detected from video feeds.
    
    This is separate from /ws (vehicle tracking) to maintain
    backward compatibility.
    """
    await ws.accept()
    _video_connections.append(ws)
    logger.info(f"Video WS client connected ({len(_video_connections)} total)")

    try:
        while True:
            # Keep connection alive, listen for client pings
            data = await ws.receive_text()
            # Client can send 'ping' for keepalive
            if data == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        if ws in _video_connections:
            _video_connections.remove(ws)
        logger.info(f"Video WS client disconnected ({len(_video_connections)} remaining)")
    except Exception as e:
        if ws in _video_connections:
            _video_connections.remove(ws)
        logger.error(f"Video WS error: {e}")
