"""
Sync service — pulls raw punch data from ZKTeco devices via pyzk,
stores it locally, and forwards it to NestJS for attendance processing.

This service is intentionally thin: it is a pyzk TCP adapter only.
All attendance calculation (shift lookup, late minutes, UPSERT) lives
exclusively in the NestJS AttendanceEngineService.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, and_, update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import BiometricDevice, DeviceStatus, ConnectionMode
from app.models.employee import BiometricEmployee
from app.models.attendance_log import AttendanceLog, PunchType, VerifyMethod
from app.models.sync_log import DeviceSyncLog, SyncType, SyncStatus
from app.utils.pyzk_client import PyZKClient, ZKPunch
from app.utils.exceptions import DeviceNotFoundError, SyncError
from app.utils.punch_forwarder import forward_punches
from app.services.websocket_manager import manager as ws_manager

logger = logging.getLogger(__name__)


class SyncService:
    """
    Handles device synchronization — pulls punch data from ZKTeco devices
    and stores raw attendance logs.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def sync_device(
        self,
        device_id: uuid.UUID,
        sync_type: SyncType = SyncType.AUTO,
    ) -> DeviceSyncLog:
        """
        Sync attendance logs from a single device.
        Full workflow: connect → fetch → deduplicate → store → log.
        """
        # 1. Load device
        result = await self.session.execute(
            select(BiometricDevice).where(BiometricDevice.id == device_id)
        )
        device = result.scalar_one_or_none()
        if not device:
            raise DeviceNotFoundError(str(device_id))

        if device.connection_mode != ConnectionMode.PULL:
            raise SyncError(str(device_id), "Device is in PUSH mode, cannot pull")

        # 2. Create sync log entry
        sync_log = DeviceSyncLog(
            tenant_id=device.tenant_id,
            device_id=device.id,
            sync_type=sync_type,
            status=SyncStatus.IN_PROGRESS,
            started_at=datetime.utcnow(),
        )
        self.session.add(sync_log)
        await self.session.flush()

        batch_id = uuid.uuid4()

        try:
            # 3. Connect and fetch via pyzk
            client = PyZKClient(ip=device.ip_address, port=device.port)

            with client:
                raw_punches = client.get_attendance()

            if not raw_punches:
                sync_log.status = SyncStatus.SUCCESS
                sync_log.records_fetched = 0
                sync_log.records_new = 0
                sync_log.records_duplicate = 0
                sync_log.completed_at = datetime.utcnow()
                device.last_sync_at = datetime.utcnow()
                device.status = DeviceStatus.ONLINE
                device.last_heartbeat_at = datetime.utcnow()
                await self.session.flush()
                logger.info(f"Sync complete for {device.name}: 0 records")
                return sync_log

            # 4. Build employee lookup (device_user_id → biometric_employee)
            employee_map = await self._build_employee_map(device.tenant_id)

            # 5. Process and store punches
            new_count = 0
            dup_count = 0
            punches_to_forward: list[dict] = []  # raw data for NestJS forwarding

            for punch in raw_punches:
                employee = employee_map.get(punch.user_id)
                if not employee:
                    logger.debug(
                        f"Unknown user_id {punch.user_id} on device {device.name}, skipping"
                    )
                    continue

                # Determine punch type from device status field
                punch_type = self._resolve_punch_type(punch, device)
                verify_method = self._resolve_verify_method(punch.punch_type)

                # Attempt insert (skip duplicates via ON CONFLICT DO NOTHING)
                stmt = pg_insert(AttendanceLog).values(
                    tenant_id=device.tenant_id,
                    device_id=device.id,
                    employee_id=employee.id,
                    punch_time=punch.timestamp,
                    punch_type=punch_type,
                    verify_method=verify_method,
                    raw_data={
                        "user_id": punch.user_id,
                        "status": punch.status,
                        "punch_type": punch.punch_type,
                        "uid": punch.uid,
                    },
                    is_processed=False,
                    is_forwarded=False,
                    sync_batch_id=batch_id,
                ).on_conflict_do_nothing(
                    constraint="uq_attendance_log_punch"
                )

                result = await self.session.execute(stmt)

                if result.rowcount > 0:
                    new_count += 1
                    punches_to_forward.append({
                        "employee_code": employee.employee_code,
                        "punch_time": punch.timestamp,
                        "punch_type": punch_type.value,
                    })

                    # Broadcast via WebSocket
                    await ws_manager.broadcast_punch_received(
                        tenant_id=str(device.tenant_id),
                        employee_code=employee.employee_code,
                        employee_name=employee.full_name,
                        punch_time=punch.timestamp.isoformat(),
                        punch_type=punch_type.value,
                        device_name=device.name,
                        verify_method=verify_method.value,
                    )
                else:
                    dup_count += 1

            # Flush so punch rows are visible before we mark forwarding state
            await self.session.flush()

            # 6. Forward new punches to NestJS for attendance processing.
            #    On failure, is_forwarded stays False — the retry task picks
            #    them up on the next cycle (see sync_tasks.retry_failed_syncs_task).
            if punches_to_forward:
                from app.config import get_settings as _get_settings
                _settings = _get_settings()
                device_sn = getattr(device, "serial_number", None) or device.name
                forwarded_ok = await forward_punches(
                    device_sn=device_sn,
                    punches=punches_to_forward,
                    tenant_api_key=_settings.hms_api_key,
                )
                if forwarded_ok:
                    # Mark this batch as forwarded
                    await self.session.execute(
                        sa_update(AttendanceLog)
                        .where(AttendanceLog.sync_batch_id == batch_id)
                        .values(
                            is_forwarded=True,
                            forwarded_at=datetime.now(timezone.utc),
                        )
                    )
                    await self.session.flush()
                else:
                    logger.warning(
                        f"Punch forwarding failed for device {device.name} "
                        f"({new_count} punches) — will retry on next cycle"
                    )

            # 7. Update sync log and device status
            sync_log.status = SyncStatus.SUCCESS
            sync_log.records_fetched = len(raw_punches)
            sync_log.records_new = new_count
            sync_log.records_duplicate = dup_count
            sync_log.completed_at = datetime.utcnow()

            device.last_sync_at = datetime.utcnow()
            device.status = DeviceStatus.ONLINE
            device.last_heartbeat_at = datetime.utcnow()

            await self.session.flush()

            logger.info(
                f"Sync complete for {device.name}: "
                f"fetched={len(raw_punches)}, new={new_count}, duplicates={dup_count}"
            )

            return sync_log

        except Exception as e:
            sync_log.status = SyncStatus.FAILED
            sync_log.error_message = str(e)[:1000]
            sync_log.completed_at = datetime.utcnow()
            sync_log.retry_count += 1

            device.status = DeviceStatus.ERROR

            await self.session.flush()

            logger.error(f"Sync failed for device {device.name}: {e}")
            raise SyncError(str(device_id), str(e))

    async def sync_all_devices(
        self,
        tenant_id: Optional[uuid.UUID] = None,
    ) -> List[DeviceSyncLog]:
        """Sync all active PULL-mode devices."""
        query = select(BiometricDevice).where(
            and_(
                BiometricDevice.is_active == True,
                BiometricDevice.connection_mode == ConnectionMode.PULL,
            )
        )
        if tenant_id:
            query = query.where(BiometricDevice.tenant_id == tenant_id)

        result = await self.session.execute(query)
        devices = list(result.scalars().all())

        sync_logs = []
        for device in devices:
            try:
                log = await self.sync_device(device.id, SyncType.AUTO)
                sync_logs.append(log)
            except Exception as e:
                logger.error(f"Failed to sync device {device.name}: {e}")
                # Continue with other devices

        return sync_logs

    async def retry_failed_sync(self, sync_log_id: uuid.UUID) -> DeviceSyncLog:
        """Retry a previously failed sync operation."""
        result = await self.session.execute(
            select(DeviceSyncLog).where(DeviceSyncLog.id == sync_log_id)
        )
        old_log = result.scalar_one_or_none()
        if not old_log:
            raise SyncError(str(sync_log_id), "Sync log not found")

        return await self.sync_device(old_log.device_id, SyncType.RETRY)

    async def get_sync_logs(
        self,
        tenant_id: uuid.UUID,
        device_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ):
        """Get sync logs with filters and pagination."""
        from sqlalchemy import func as sqlfunc

        query = select(DeviceSyncLog).where(
            DeviceSyncLog.tenant_id == tenant_id
        )

        if device_id:
            query = query.where(DeviceSyncLog.device_id == device_id)
        if status:
            query = query.where(DeviceSyncLog.status == SyncStatus(status))

        count_query = select(sqlfunc.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar() or 0

        query = query.order_by(DeviceSyncLog.started_at.desc())
        query = query.offset((page - 1) * limit).limit(limit)

        result = await self.session.execute(query)
        logs = list(result.scalars().all())

        return logs, total

    async def _build_employee_map(self, tenant_id: uuid.UUID) -> dict:
        """Build a lookup of device_user_id → BiometricEmployee."""
        result = await self.session.execute(
            select(BiometricEmployee).where(
                and_(
                    BiometricEmployee.tenant_id == tenant_id,
                    BiometricEmployee.is_active == True,
                    BiometricEmployee.device_user_id.isnot(None),
                )
            )
        )
        employees = result.scalars().all()
        return {emp.device_user_id: emp for emp in employees}

    @staticmethod
    def _resolve_punch_type(punch: ZKPunch, device: BiometricDevice) -> PunchType:
        """
        Determine if a punch is IN or OUT.
        Priority: 1) Device type → 2) Punch status field → 3) UNKNOWN
        """
        # If device is dedicated IN or OUT, use that
        if device.device_type == "IN":
            return PunchType.IN
        if device.device_type == "OUT":
            return PunchType.OUT

        # Use the status field from the punch (ZKTeco convention: 0=IN, 1=OUT)
        if punch.status == 0:
            return PunchType.IN
        elif punch.status == 1:
            return PunchType.OUT

        return PunchType.UNKNOWN

    @staticmethod
    def _resolve_verify_method(punch_type_code: int) -> VerifyMethod:
        """Map ZKTeco verification type codes to our enum."""
        mapping = {
            0: VerifyMethod.PASSWORD,
            1: VerifyMethod.FINGERPRINT,
            2: VerifyMethod.CARD,
            15: VerifyMethod.FACE,
        }
        return mapping.get(punch_type_code, VerifyMethod.OTHER)
