"""
Pydantic schemas for employee endpoints.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── Request Schemas ──────────────────────────────────────────

class EmployeeCreate(BaseModel):
    """Schema for registering an employee for biometric attendance."""
    tenant_id: uuid.UUID
    hms_employee_id: uuid.UUID = Field(..., description="Employee ID from Ai-HRMS core")
    employee_code: str = Field(..., min_length=1, max_length=50, examples=["EMP001"])
    full_name: str = Field(..., min_length=1, max_length=200, examples=["John Doe"])
    device_user_id: Optional[int] = Field(None, description="User ID on ZKTeco device")
    card_number: Optional[str] = Field(None, max_length=50)
    devices: Optional[list[uuid.UUID]] = Field(None, description="Device IDs to map")


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee mapping."""
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    device_user_id: Optional[int] = None
    card_number: Optional[str] = Field(None, max_length=50)
    fingerprint_registered: Optional[bool] = None
    face_registered: Optional[bool] = None
    is_active: Optional[bool] = None
    devices: Optional[list[uuid.UUID]] = None


class BulkEmployeeMap(BaseModel):
    """Schema for bulk-mapping employees to devices."""
    tenant_id: uuid.UUID
    employee_ids: list[uuid.UUID] = Field(..., min_length=1)
    device_ids: list[uuid.UUID] = Field(..., min_length=1)


class EmployeeEnrollRequest(BaseModel):
    """Schema for enrolling biometric data on a device."""
    device_id: uuid.UUID
    enroll_type: str = Field(default="fingerprint", pattern="^(fingerprint|face|card)$")


# ── Response Schemas ─────────────────────────────────────────

class EmployeeResponse(BaseModel):
    """Full employee response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    hms_employee_id: uuid.UUID
    employee_code: str
    full_name: str
    device_user_id: Optional[int] = None
    fingerprint_registered: bool
    face_registered: bool
    card_number: Optional[str] = None
    is_active: bool
    devices: Optional[list[uuid.UUID]] = None
    created_at: datetime
    updated_at: datetime


class EmployeeListResponse(BaseModel):
    """Paginated employee list."""
    success: bool = True
    data: list[EmployeeResponse]
    total: int
    page: int
    limit: int
