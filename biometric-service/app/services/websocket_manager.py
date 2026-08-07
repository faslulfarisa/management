"""
WebSocket connection manager for real-time attendance updates.
Manages per-tenant WebSocket connections and broadcasts events.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections organized by tenant_id.
    Broadcasts attendance events to all connected clients of a tenant.
    """

    def __init__(self):
        # tenant_id → set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}
        self._connection_count: int = 0

    async def connect(self, websocket: WebSocket, tenant_id: str) -> None:
        """Accept a new WebSocket connection for a tenant."""
        await websocket.accept()

        if tenant_id not in self._connections:
            self._connections[tenant_id] = set()

        self._connections[tenant_id].add(websocket)
        self._connection_count += 1

        logger.info(
            f"WebSocket connected: tenant={tenant_id}, "
            f"total_connections={self._connection_count}"
        )

        # Send welcome message
        await self._send_json(websocket, {
            "type": "connected",
            "message": "Connected to biometric attendance stream",
            "tenant_id": tenant_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

    async def disconnect(self, websocket: WebSocket, tenant_id: str) -> None:
        """Remove a WebSocket connection."""
        if tenant_id in self._connections:
            self._connections[tenant_id].discard(websocket)
            self._connection_count -= 1

            if not self._connections[tenant_id]:
                del self._connections[tenant_id]

        logger.info(
            f"WebSocket disconnected: tenant={tenant_id}, "
            f"total_connections={self._connection_count}"
        )

    async def disconnect_all(self) -> None:
        """Disconnect all WebSocket connections (for shutdown)."""
        for tenant_id, connections in self._connections.items():
            for ws in connections:
                try:
                    await ws.close()
                except Exception:
                    pass
        self._connections.clear()
        self._connection_count = 0
        logger.info("All WebSocket connections closed")

    async def broadcast_to_tenant(
        self,
        tenant_id: str,
        event_type: str,
        data: Dict[str, Any],
    ) -> int:
        """
        Broadcast an event to all connected clients of a tenant.
        Returns the number of clients that received the message.
        """
        if tenant_id not in self._connections:
            return 0

        message = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }

        sent = 0
        dead_connections: Set[WebSocket] = set()

        for websocket in self._connections[tenant_id]:
            try:
                await self._send_json(websocket, message)
                sent += 1
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                dead_connections.add(websocket)

        # Cleanup dead connections
        for ws in dead_connections:
            self._connections[tenant_id].discard(ws)
            self._connection_count -= 1

        if not self._connections.get(tenant_id):
            self._connections.pop(tenant_id, None)

        return sent

    async def broadcast_punch_received(
        self,
        tenant_id: str,
        employee_code: str,
        employee_name: str,
        punch_time: str,
        punch_type: str,
        device_name: str,
        verify_method: str,
    ) -> int:
        """Broadcast a new punch event."""
        return await self.broadcast_to_tenant(
            tenant_id,
            "punch_received",
            {
                "employee_code": employee_code,
                "employee_name": employee_name,
                "punch_time": punch_time,
                "punch_type": punch_type,
                "device_name": device_name,
                "verify_method": verify_method,
            },
        )

    async def broadcast_device_status(
        self,
        tenant_id: str,
        device_id: str,
        device_name: str,
        status: str,
        previous_status: str,
    ) -> int:
        """Broadcast a device status change."""
        return await self.broadcast_to_tenant(
            tenant_id,
            "device_status_changed",
            {
                "device_id": device_id,
                "device_name": device_name,
                "status": status,
                "previous_status": previous_status,
            },
        )

    @staticmethod
    async def _send_json(websocket: WebSocket, data: Dict[str, Any]) -> None:
        """Send JSON data through a WebSocket."""
        await websocket.send_text(json.dumps(data, default=str))

    @property
    def active_tenants(self) -> int:
        """Number of tenants with active connections."""
        return len(self._connections)

    @property
    def total_connections(self) -> int:
        """Total number of active WebSocket connections."""
        return self._connection_count


# Module-level singleton
manager = ConnectionManager()
