"""
Pydantic schemas for shift rule endpoints.
"""

import uuid
from datetime import time, datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# ── Request Schemas ──────────────────────────────────────────

class ShiftRuleCreate(BaseModel):
    """Schema for creating a shift rule."""
    tenant_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=100, examples=["Morning Shift"])
    code: str = Field(..., min_length=1, max_length=20, examples=["MS"])
    start_time: time = Field(..., examples=["09:00:00"])
    end_time: time = Field(..., examples=["18:00:00"])
    is_overnight: bool = Field(default=False, description="True if shift crosses midnight")
    break_minutes: int = Field(default=0, ge=0)
    grace_period_in: int = Field(default=15, ge=0, description="Late tolerance in minutes")
    grace_period_out: int = Field(default=15, ge=0, description="Early leave tolerance in minutes")
    overtime_threshold_minutes: int = Field(default=30, ge=0)
    max_overtime_minutes: int = Field(default=240, ge=0)
    half_day_threshold_minutes: int = Field(default=240, ge=0)
    min_work_hours: float = Field(default=8.0, ge=0)


class ShiftRuleUpdate(BaseModel):
    """Schema for updating a shift rule."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_overnight: Optional[bool] = None
    break_minutes: Optional[int] = Field(None, ge=0)
    grace_period_in: Optional[int] = Field(None, ge=0)
    grace_period_out: Optional[int] = Field(None, ge=0)
    overtime_threshold_minutes: Optional[int] = Field(None, ge=0)
    max_overtime_minutes: Optional[int] = Field(None, ge=0)
    half_day_threshold_minutes: Optional[int] = Field(None, ge=0)
    min_work_hours: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


# ── Response Schemas ─────────────────────────────────────────

class ShiftRuleResponse(BaseModel):
    """Full shift rule response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    code: str
    start_time: time
    end_time: time
    is_overnight: bool
    break_minutes: int
    grace_period_in: int
    grace_period_out: int
    overtime_threshold_minutes: int
    max_overtime_minutes: int
    half_day_threshold_minutes: int
    min_work_hours: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ShiftRuleListResponse(BaseModel):
    """Shift rules list."""
    success: bool = True
    data: list[ShiftRuleResponse]
    total: int
