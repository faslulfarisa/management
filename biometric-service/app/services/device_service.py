"""
Device management service — CRUD operations and status tracking
for biometric devices.
"""

import logging
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import select, func, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import BiometricDevice, DeviceType, ConnectionMode, DeviceStatus
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceTestResult
from app.utils.pyzk_client import PyZKClient
from app.utils.exceptions import DeviceNotFoundError

logger = logging.getLogger(__name__)


class DeviceService:
    """Business logic for biometric device management."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_devices(
        self,
        tenant_id: uuid.UUID,
        page: int = 1,
        limit: int = 20,
        branch_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Tuple[List[BiometricDevice], int]:
        """List devices with filters and pagination."""
        query = select(BiometricDevice).where(
            BiometricDevice.tenant_id == tenant_id
        )

        if branch_id:
            query = query.where(BiometricDevice.branch_id == branch_id)
        if status:
            query = query.where(BiometricDevice.status == DeviceStatus(status))
        if is_active is not None:
            query = query.where(BiometricDevice.is_active == is_active)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self.session.execute(count_query)).scalar() or 0

        # Apply pagination
        query = query.order_by(BiometricDevice.created_at.desc())
        query = query.offset((page - 1) * limit).limit(limit)

        result = await self.session.execute(query)
        devices = list(result.scalars().all())

        return devices, total

    async def get_device(self, device_id: uuid.UUID) -> BiometricDevice:
        """Get a single device by ID."""
        result = await self.session.execute(
            select(BiometricDevice).where(BiometricDevice.id == device_id)
        )
        device = result.scalar_one_or_none()
        if not device:
            raise DeviceNotFoundError(str(device_id))
        return device

    async def get_device_by_serial(self, serial_number: str) -> Optional[BiometricDevice]:
        """Get a device by serial number."""
        result = await self.session.execute(
            select(BiometricDevice).where(
                BiometricDevice.serial_number == serial_number
            )
        )
        return result.scalar_one_or_none()

    async def create_device(self, data: DeviceCreate) -> BiometricDevice:
        """Register a new biometric device."""
        device = BiometricDevice(
            tenant_id=data.tenant_id,
            branch_id=data.branch_id,
            name=data.name,
            serial_number=data.serial_number,
            ip_address=data.ip_address,
            port=data.port,
            model=data.model,
            firmware_version=data.firmware_version,
            location=data.location,
            device_type=DeviceType(data.device_type),
            connection_mode=ConnectionMode(data.connection_mode),
            config=data.config or {},
        )

        self.session.add(device)
        await self.session.flush()
        await self.session.refresh(device)

        logger.info(f"Created device: {device.name} (SN: {device.serial_number})")
        return device

    async def update_device(
        self, device_id: uuid.UUID, data: DeviceUpdate
    ) -> BiometricDevice:
        """Update a device's configuration."""
        device = await self.get_device(device_id)

        update_data = data.model_dump(exclude_unset=True)
        if "device_type" in update_data and update_data["device_type"]:
            update_data["device_type"] = DeviceType(update_data["device_type"])
        if "connection_mode" in update_data and update_data["connection_mode"]:
            update_data["connection_mode"] = ConnectionMode(update_data["connection_mode"])

        for field, value in update_data.items():
            setattr(device, field, value)

        device.updated_at = datetime.utcnow()
        await self.session.flush()
        await self.session.refresh(device)

        logger.info(f"Updated device: {device.name} (ID: {device.id})")
        return device

    async def deactivate_device(self, device_id: uuid.UUID) -> BiometricDevice:
        """Soft-delete a device by deactivating it."""
        device = await self.get_device(device_id)
        device.is_active = False
        device.updated_at = datetime.utcnow()
        await self.session.flush()

        logger.info(f"Deactivated device: {device.name} (ID: {device.id})")
        return device

    async def test_connection(self, device_id: uuid.UUID) -> DeviceTestResult:
        """Test connectivity to a device via pyzk."""
        device = await self.get_device(device_id)

        client = PyZKClient(
            ip=device.ip_address,
            port=device.port,
        )

        reachable, response_time = client.ping()

        result = DeviceTestResult(
            device_id=device.id,
            serial_number=device.serial_number,
            reachable=reachable,
            response_time_ms=response_time,
        )

        if reachable:
            # Update device status
            device.status = DeviceStatus.ONLINE
            device.last_heartbeat_at = datetime.utcnow()

            # Fetch additional info
            try:
                with client as zk:
                    info = zk.get_device_info()
                    if info:
                        result.device_name = info.device_name
                        result.firmware = info.firmware_version
                        result.user_count = info.user_count
                        result.log_count = info.log_count
            except Exception as e:
                result.error = f"Connected but failed to fetch info: {e}"
        else:
            device.status = DeviceStatus.OFFLINE
            result.error = "Device unreachable"

        device.updated_at = datetime.utcnow()
        await self.session.flush()

        return result

    async def update_heartbeat(
        self,
        device_id: uuid.UUID,
        status: DeviceStatus,
    ) -> None:
        """Update device heartbeat timestamp and status."""
        await self.session.execute(
            update(BiometricDevice)
            .where(BiometricDevice.id == device_id)
            .values(
                status=status,
                last_heartbeat_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )

    async def get_active_pull_devices(
        self, tenant_id: Optional[uuid.UUID] = None
    ) -> List[BiometricDevice]:
        """Get all active devices configured for PULL mode (pyzk sync)."""
        query = select(BiometricDevice).where(
            and_(
                BiometricDevice.is_active == True,
                BiometricDevice.connection_mode == ConnectionMode.PULL,
            )
        )
        if tenant_id:
            query = query.where(BiometricDevice.tenant_id == tenant_id)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_all_active_devices(
        self, tenant_id: Optional[uuid.UUID] = None
    ) -> List[BiometricDevice]:
        """Get all active devices regardless of connection mode."""
        query = select(BiometricDevice).where(
            BiometricDevice.is_active == True
        )
        if tenant_id:
            query = query.where(BiometricDevice.tenant_id == tenant_id)

        result = await self.session.execute(query)
        return list(result.scalars().all())
