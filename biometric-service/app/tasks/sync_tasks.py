"""
Background tasks for synchronizing devices.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, update as sa_update

from app.tasks.celery_app import celery_app
from app.database import async_session_factory
from app.services.sync_service import SyncService
from app.models.attendance_log import AttendanceLog
from app.models.device import BiometricDevice
from app.models.employee import BiometricEmployee
from app.utils.punch_forwarder import forward_punches

logger = logging.getLogger(__name__)

_MAX_RETRY_BATCH = 500
_FORWARDING_LAG_MINUTES = 2  # skip punches newer than this to avoid races with live syncs


async def _sync_all_devices_async():
    async with async_session_factory() as session:
        service = SyncService(session)
        logs = await service.sync_all_devices()
        return len(logs)


@celery_app.task(name="app.tasks.sync_tasks.sync_all_devices_task")
def sync_all_devices_task():
    """Periodic task to pull attendance from all active PULL-mode devices."""
    logger.info("Starting scheduled sync for all devices")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    synced_count = loop.run_until_complete(_sync_all_devices_async())
    return {"status": "completed", "devices_attempted": synced_count}


async def _retry_failed_syncs_async():
    """Find and retry recently failed syncs."""
    pass


@celery_app.task(name="app.tasks.sync_tasks.retry_failed_syncs_task")
def retry_failed_syncs_task():
    """Periodic task to retry failed device syncs."""
    logger.info("Retrying failed sync operations")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(_retry_failed_syncs_async())
    return {"status": "completed"}


async def _retry_unforwarded_punches_async() -> dict:
    """
    Find attendance_logs where is_forwarded=False and forward them to NestJS.
    Groups by (tenant_id, device) to minimise HTTP round-trips.
    Skips punches created within the last FORWARDING_LAG_MINUTES to avoid
    racing with an in-progress sync that hasn't flushed yet.
    """
    from app.config import get_settings as _get_settings
    settings = _get_settings()
    api_key = settings.hms_api_key

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=_FORWARDING_LAG_MINUTES)

    async with async_session_factory() as session:
        result = await session.execute(
            select(
                AttendanceLog.id,
                AttendanceLog.tenant_id,
                AttendanceLog.employee_id,
                AttendanceLog.punch_time,
                AttendanceLog.punch_type,
                AttendanceLog.device_id,
                BiometricDevice.serial_number.label("device_sn"),
                BiometricEmployee.employee_code,
            )
            .join(BiometricDevice, AttendanceLog.device_id == BiometricDevice.id)
            .join(BiometricEmployee, AttendanceLog.employee_id == BiometricEmployee.id)
            .where(
                AttendanceLog.is_forwarded == False,
                AttendanceLog.created_at < cutoff,
            )
            .order_by(AttendanceLog.punch_time)
            .limit(_MAX_RETRY_BATCH)
        )
        rows = result.all()

    if not rows:
        return {"forwarded": 0, "failed": 0}

    # Group by (tenant_id, device_sn)
    groups: dict[tuple, list] = {}
    row_ids_by_group: dict[tuple, list[str]] = {}
    for row in rows:
        key = (str(row.tenant_id), row.device_sn or str(row.device_id))
        groups.setdefault(key, []).append({
            "employee_code": row.employee_code,
            "punch_time": row.punch_time,
            "punch_type": str(row.punch_type.value if hasattr(row.punch_type, "value") else row.punch_type),
        })
        row_ids_by_group.setdefault(key, []).append(str(row.id))

    total_forwarded = 0
    total_failed = 0

    for (tenant_id, device_sn), punches in groups.items():
        ok = await forward_punches(
            device_sn=device_sn,
            punches=punches,
            tenant_api_key=api_key,
        )
        if ok:
            ids = row_ids_by_group[(tenant_id, device_sn)]
            async with async_session_factory() as session:
                await session.execute(
                    sa_update(AttendanceLog)
                    .where(AttendanceLog.id.in_(ids))
                    .values(is_forwarded=True, forwarded_at=datetime.now(timezone.utc))
                )
                await session.commit()
            total_forwarded += len(ids)
            logger.info(
                "Retry-forwarded %d punches for tenant=%s device=%s",
                len(ids), tenant_id, device_sn,
            )
        else:
            total_failed += len(punches)
            logger.warning(
                "Retry-forward failed for tenant=%s device=%s (%d punches)",
                tenant_id, device_sn, len(punches),
            )

    return {"forwarded": total_forwarded, "failed": total_failed}


@celery_app.task(name="app.tasks.sync_tasks.retry_unforwarded_punches_task")
def retry_unforwarded_punches_task():
    """Periodic task to re-forward punches that were not forwarded during the sync."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    result = loop.run_until_complete(_retry_unforwarded_punches_async())
    if result["forwarded"] or result["failed"]:
        logger.info("Unforwarded punch retry: %s", result)
    return {"status": "completed", **result}
