"""
Pydantic schemas for device endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── Request Schemas ──────────────────────────────────────────

class DeviceCreate(BaseModel):
    """Schema for registering a new biometric device."""
    tenant_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    name: str = Field(..., min_length=1, max_length=100, examples=["Main Entrance"])
    serial_number: str = Field(..., min_length=1, max_length=100, examples=["BSXK203760145"])
    ip_address: str = Field(..., examples=["192.168.1.201"])
    port: int = Field(default=4370, ge=1, le=65535)
    model: Optional[str] = Field(None, max_length=50, examples=["ZK-IN01-A"])
    firmware_version: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200, examples=["Ground Floor Lobby"])
    device_type: str = Field(default="BOTH", pattern="^(IN|OUT|BOTH)$")
    connection_mode: str = Field(default="PULL", pattern="^(PULL|PUSH)$")
    config: Optional[dict] = None


class DeviceUpdate(BaseModel):
    """Schema for updating a device."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    ip_address: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    model: Optional[str] = Field(None, max_length=50)
    firmware_version: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=200)
    branch_id: Optional[uuid.UUID] = None
    device_type: Optional[str] = Field(None, pattern="^(IN|OUT|BOTH)$")
    connection_mode: Optional[str] = Field(None, pattern="^(PULL|PUSH)$")
    is_active: Optional[bool] = None
    config: Optional[dict] = None


# ── Response Schemas ─────────────────────────────────────────

class DeviceResponse(BaseModel):
    """Full device response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    name: str
    serial_number: str
    ip_address: str
    port: int
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    location: Optional[str] = None
    device_type: str
    connection_mode: str
    is_active: bool
    status: str
    last_heartbeat_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    config: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class DeviceStatusResponse(BaseModel):
    """Device heartbeat/status response."""
    id: uuid.UUID
    name: str
    serial_number: str
    status: str
    last_heartbeat_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    is_active: bool


class DeviceTestResult(BaseModel):
    """Result of testing device connectivity."""
    device_id: uuid.UUID
    serial_number: str
    reachable: bool
    response_time_ms: Optional[float] = None
    device_name: Optional[str] = None
    firmware: Optional[str] = None
    user_count: Optional[int] = None
    log_count: Optional[int] = None
    error: Optional[str] = None


class DeviceListResponse(BaseModel):
    """Paginated device list response."""
    success: bool = True
    data: list[DeviceResponse]
    total: int
    page: int
    limit: int
