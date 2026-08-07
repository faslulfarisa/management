"""
Pydantic schemas for sync endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SyncLogResponse(BaseModel):
    """Sync log entry response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    device_id: uuid.UUID
    sync_type: str
    status: str
    records_fetched: int
    records_new: int
    records_duplicate: int
    error_message: Optional[str] = None
    retry_count: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime


class SyncLogWithDevice(SyncLogResponse):
    """Sync log with device details."""
    device_name: Optional[str] = None
    device_serial: Optional[str] = None


class SyncTriggerResponse(BaseModel):
    """Response for sync trigger."""
    success: bool
    message: str
    sync_log_id: Optional[uuid.UUID] = None
    records_fetched: int = 0
    records_new: int = 0
    error: Optional[str] = None


class SyncAllResponse(BaseModel):
    """Response for syncing all devices."""
    success: bool
    message: str
    devices_synced: int
    devices_failed: int
    total_records_new: int
    results: list[SyncTriggerResponse]


class SyncLogListResponse(BaseModel):
    """Paginated sync log list."""
    success: bool = True
    data: list[SyncLogWithDevice]
    total: int
    page: int
    limit: int
