"""
Background tasks for device heartbeat monitoring.
"""

import asyncio
import logging

from app.tasks.celery_app import celery_app
from app.database import async_session_factory
from app.services.device_service import DeviceService

logger = logging.getLogger(__name__)


async def _check_heartbeats_async():
    """Async implementation of heartbeat checking."""
    async with async_session_factory() as session:
        service = DeviceService(session)
        # Only ping PULL mode devices, PUSH mode update their own heartbeat
        devices = await service.get_active_pull_devices()
        
        results = {"online": 0, "offline": 0}
        
        for device in devices:
            try:
                res = await service.test_connection(device.id)
                if res.reachable:
                    results["online"] += 1
                else:
                    results["offline"] += 1
            except Exception as e:
                logger.error(f"Heartbeat check failed for {device.name}: {e}")
                results["offline"] += 1
                
        return results


@celery_app.task(name="app.tasks.heartbeat_tasks.check_heartbeats_task")
def check_heartbeats_task():
    """
    Periodic task to ping all PULL-mode devices to ensure they are online.
    """
    logger.debug("Running device heartbeat check")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    results = loop.run_until_complete(_check_heartbeats_async())
    return {"status": "completed", "results": results}
