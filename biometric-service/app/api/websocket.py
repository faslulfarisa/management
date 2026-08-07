"""
WebSocket API Route.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)
ws_router = APIRouter()


@ws_router.websocket("/ws/attendance/{tenant_id}")
async def attendance_stream(websocket: WebSocket, tenant_id: str):
    """
    Real-time WebSocket endpoint for attendance updates.
    Clients connect to this to receive live punch notifications
    and device status changes.
    """
    await manager.connect(websocket, tenant_id)
    
    try:
        while True:
            # We don't expect the client to send anything, but we need
            # to await receive to detect disconnects
            data = await websocket.receive_text()
            
            # Simple ping/pong for keepalive if client sends it
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        await manager.disconnect(websocket, tenant_id)
    except Exception as e:
        logger.error(f"WebSocket error for tenant {tenant_id}: {e}")
        await manager.disconnect(websocket, tenant_id)
