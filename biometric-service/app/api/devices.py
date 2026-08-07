"""
Device Management API Routes.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.device import (
    DeviceCreate,
    DeviceUpdate,
    DeviceResponse,
    DeviceListResponse,
    DeviceStatusResponse,
    DeviceTestResult,
)
from app.services.device_service import DeviceService
from app.utils.exceptions import DeviceNotFoundError, DeviceConnectionError

router = APIRouter()


@router.get("", response_model=DeviceListResponse)
async def list_devices(
    tenant_id: uuid.UUID = Query(..., description="Organization ID"),
    branch_id: Optional[uuid.UUID] = None,
    device_status: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """List biometric devices with filtering and pagination."""
    service = DeviceService(session)
    devices, total = await service.list_devices(
        tenant_id=tenant_id,
        branch_id=branch_id,
        status=device_status,
        is_active=is_active,
        page=page,
        limit=limit,
    )
    return {
        "success": True,
        "data": devices,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    data: DeviceCreate,
    session: AsyncSession = Depends(get_session),
):
    """Register a new biometric device."""
    service = DeviceService(session)
    
    # Check serial number uniqueness
    existing = await service.get_device_by_serial(data.serial_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Device with this serial number already exists"
        )
        
    return await service.create_device(data)


@router.get("/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Get device details by ID."""
    service = DeviceService(session)
    try:
        return await service.get_device(device_id)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")


@router.put("/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: uuid.UUID,
    data: DeviceUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update device configuration."""
    service = DeviceService(session)
    try:
        return await service.update_device(device_id, data)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")


@router.delete("/{device_id}", response_model=DeviceResponse)
async def deactivate_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Deactivate a device (soft delete)."""
    service = DeviceService(session)
    try:
        return await service.deactivate_device(device_id)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")


@router.post("/{device_id}/test", response_model=DeviceTestResult)
async def test_device_connection(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Test pyzk connectivity to a PULL-mode device."""
    service = DeviceService(session)
    try:
        return await service.test_connection(device_id)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")
    except DeviceConnectionError as e:
        raise HTTPException(status_code=503, detail=e.message)


@router.get("/{device_id}/status", response_model=DeviceStatusResponse)
async def get_device_status(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Get the latest heartbeat and connection status of a device."""
    service = DeviceService(session)
    try:
        return await service.get_device(device_id)
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")
