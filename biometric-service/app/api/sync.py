"""
Synchronization API Routes.
Manually trigger pyzk syncs and view sync logs.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.sync import (
    SyncTriggerResponse,
    SyncAllResponse,
    SyncLogListResponse,
)
from app.services.sync_service import SyncService
from app.models.sync_log import SyncType
from app.utils.exceptions import DeviceNotFoundError, SyncError

router = APIRouter()


@router.post("/device/{device_id}", response_model=SyncTriggerResponse)
async def sync_single_device(
    device_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Trigger an immediate PULL sync for a specific device."""
    service = SyncService(session)
    try:
        log = await service.sync_device(device_id, SyncType.MANUAL)
        return {
            "success": log.status == "success",
            "message": f"Sync completed with status: {log.status}",
            "sync_log_id": log.id,
            "records_fetched": log.records_fetched,
            "records_new": log.records_new,
            "error": log.error_message
        }
    except DeviceNotFoundError:
        raise HTTPException(status_code=404, detail="Device not found")
    except SyncError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/all", response_model=SyncAllResponse)
async def sync_all_devices(
    tenant_id: Optional[uuid.UUID] = Query(None, description="Optional tenant filter"),
    session: AsyncSession = Depends(get_session),
):
    """Trigger sync for all active PULL devices."""
    service = SyncService(session)
    logs = await service.sync_all_devices(tenant_id)
    
    results = []
    success_count = 0
    total_new = 0
    
    for log in logs:
        if log.status == "success":
            success_count += 1
            total_new += log.records_new
            
        results.append({
            "success": log.status == "success",
            "message": log.error_message or "Success",
            "sync_log_id": log.id,
            "records_fetched": log.records_fetched,
            "records_new": log.records_new
        })
        
    return {
        "success": True,
        "message": f"Synced {len(logs)} devices",
        "devices_synced": success_count,
        "devices_failed": len(logs) - success_count,
        "total_records_new": total_new,
        "results": results
    }


@router.get("/logs", response_model=SyncLogListResponse)
async def get_sync_logs(
    tenant_id: uuid.UUID = Query(...),
    device_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Get synchronization history."""
    service = SyncService(session)
    logs, total = await service.get_sync_logs(
        tenant_id=tenant_id,
        device_id=device_id,
        status=status,
        page=page,
        limit=limit,
    )
    
    # Needs to be enhanced with device name/serial via join in real app
    # For now returning base logs
    return {
        "success": True,
        "data": logs,
        "total": total,
        "page": page,
        "limit": limit
    }
