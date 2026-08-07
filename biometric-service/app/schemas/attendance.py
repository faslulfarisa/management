"""
Pydantic schemas for attendance endpoints.
"""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── Raw Log Schemas ──────────────────────────────────────────

class AttendanceLogResponse(BaseModel):
    """Raw punch log entry."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    device_id: uuid.UUID
    employee_id: uuid.UUID
    punch_time: datetime
    punch_type: str
    verify_method: str
    is_processed: bool
    sync_batch_id: Optional[uuid.UUID] = None
    created_at: datetime


class AttendanceLogWithEmployee(AttendanceLogResponse):
    """Raw punch log with employee details."""
    employee_code: Optional[str] = None
    employee_name: Optional[str] = None
    device_name: Optional[str] = None


# ── Session Schemas ──────────────────────────────────────────

class AttendanceSessionResponse(BaseModel):
    """Processed attendance session."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    date: date
    shift_rule_id: Optional[uuid.UUID] = None
    first_in: Optional[datetime] = None
    last_out: Optional[datetime] = None
    total_work_minutes: int
    overtime_minutes: int
    late_minutes: int
    early_departure_minutes: int
    status: str
    is_overnight: bool
    punch_count: int
    punch_sequence: Optional[list] = None
    remarks: Optional[str] = None
    synced_to_hms: bool
    synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AttendanceSessionWithDetails(AttendanceSessionResponse):
    """Session response with employee and shift details."""
    employee_code: Optional[str] = None
    employee_name: Optional[str] = None
    shift_name: Optional[str] = None


# ── Live Attendance ──────────────────────────────────────────

class LiveAttendanceEntry(BaseModel):
    """Entry for live attendance feed."""
    employee_id: uuid.UUID
    employee_code: str
    employee_name: str
    status: str
    first_in: Optional[datetime] = None
    last_out: Optional[datetime] = None
    last_punch_time: Optional[datetime] = None
    last_punch_type: Optional[str] = None
    punch_count: int = 0
    device_name: Optional[str] = None


class LiveAttendanceResponse(BaseModel):
    """Live attendance feed response."""
    success: bool = True
    data: list[LiveAttendanceEntry]
    total_employees: int
    present_count: int
    absent_count: int
    late_count: int
    timestamp: datetime


# ── Report Schemas ───────────────────────────────────────────

class AttendanceReportRequest(BaseModel):
    """Filters for attendance report."""
    tenant_id: uuid.UUID
    date_from: date
    date_to: date
    employee_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    status: Optional[str] = None


class AttendanceSummary(BaseModel):
    """Summary statistics."""
    total_employees: int
    present_today: int
    absent_today: int
    late_today: int
    on_time_today: int
    average_work_hours: float
    average_late_minutes: float
    total_overtime_minutes: int


class AttendanceReportResponse(BaseModel):
    """Full attendance report."""
    success: bool = True
    summary: AttendanceSummary
    sessions: list[AttendanceSessionWithDetails]
    total: int
    page: int
    limit: int


# ── Process Trigger ──────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Trigger attendance processing."""
    tenant_id: uuid.UUID
    date: Optional[date] = None
    employee_id: Optional[uuid.UUID] = None


class ProcessResponse(BaseModel):
    """Processing result."""
    success: bool = True
    processed: int
    errors: int
    message: str
