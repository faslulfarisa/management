"""
AttendanceSession model — processed attendance records.
Produced by the attendance engine from raw punch logs.
"""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class AttendanceStatus(str, enum.Enum):
    """Computed attendance status for the day."""
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LATE = "late"
    ON_LEAVE = "on_leave"
    HOLIDAY = "holiday"
    WEEK_OFF = "week_off"


class AttendanceSession(BaseModel):
    """
    Processed daily attendance record for an employee.
    Combines raw punches into a single session with calculated metrics.
    """

    __tablename__ = "attendance_sessions"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_id", "date",
            name="uq_attendance_session_day",
        ),
    )

    # ── Employee Reference ───────────────────────────────────
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("biometric_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Date & Shift ─────────────────────────────────────────
    date: Mapped[date] = mapped_column(
        Date, nullable=False, index=True,
        comment="Attendance date",
    )
    shift_rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift_rules.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Punch Times ──────────────────────────────────────────
    first_in: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Earliest IN punch",
    )
    last_out: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Latest OUT punch",
    )

    # ── Calculated Metrics ───────────────────────────────────
    total_work_minutes: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )
    overtime_minutes: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )
    late_minutes: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )
    early_departure_minutes: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )

    # ── Status ───────────────────────────────────────────────
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status_enum", create_constraint=True),
        default=AttendanceStatus.ABSENT,
        server_default=text("'absent'"),
    )
    is_overnight: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
        comment="Whether the shift crossed midnight",
    )

    # ── Punch Details ────────────────────────────────────────
    punch_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )
    punch_sequence: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True,
        comment="Ordered list of all punches [{time, type, method}]",
    )

    # ── Remarks ──────────────────────────────────────────────
    remarks: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
    )

    # ── Ai-HRMS Sync Status ───────────────────────────────────
    synced_to_hms: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
        index=True,
        comment="Whether this session has been pushed to Ai-HRMS core",
    )
    synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Relationships ────────────────────────────────────────
    employee = relationship("BiometricEmployee", back_populates="attendance_sessions")
    shift_rule = relationship("ShiftRule", back_populates="attendance_sessions")

    def __repr__(self) -> str:
        return (
            f"<AttendanceSession(employee_id={self.employee_id}, "
            f"date={self.date}, status={self.status})>"
        )
