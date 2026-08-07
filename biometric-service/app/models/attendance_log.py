"""
AttendanceLog model — raw punch records from biometric devices.
These are the unprocessed punches directly from ZKTeco devices.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class PunchType(str, enum.Enum):
    """Direction of the punch."""
    IN = "IN"
    OUT = "OUT"
    UNKNOWN = "UNKNOWN"


class VerifyMethod(str, enum.Enum):
    """How the employee was verified."""
    FINGERPRINT = "fingerprint"
    FACE = "face"
    CARD = "card"
    PASSWORD = "password"
    OTHER = "other"


class AttendanceLog(BaseModel):
    """
    Raw punch record from a biometric device.
    Each row = one physical punch event.
    """

    __tablename__ = "attendance_logs"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "device_id", "employee_id", "punch_time",
            name="uq_attendance_log_punch",
        ),
    )

    # ── References ───────────────────────────────────────────
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("biometric_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("biometric_employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Punch Data ───────────────────────────────────────────
    punch_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True,
        comment="Raw timestamp from the device",
    )
    punch_type: Mapped[PunchType] = mapped_column(
        Enum(PunchType, name="punch_type_enum", create_constraint=True),
        default=PunchType.UNKNOWN,
        server_default=text("'UNKNOWN'"),
    )
    verify_method: Mapped[VerifyMethod] = mapped_column(
        Enum(VerifyMethod, name="verify_method_enum", create_constraint=True),
        default=VerifyMethod.OTHER,
        server_default=text("'other'"),
    )

    # ── Metadata ─────────────────────────────────────────────
    raw_data: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Full raw punch payload from device",
    )
    is_processed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
        index=True,
        comment="Whether this punch has been consumed by the attendance engine",
    )

    # Forwarding state — tracks whether this punch has been sent to NestJS.
    # is_processed is legacy (Python engine); is_forwarded is the new field.
    is_forwarded: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
        index=True,
        comment="Whether this punch has been forwarded to NestJS /biometrics/punch",
    )
    forwarded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp when the punch was successfully forwarded to NestJS",
    )

    sync_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
        comment="Groups punches from the same sync operation",
    )

    # ── Relationships ────────────────────────────────────────
    device = relationship("BiometricDevice", back_populates="attendance_logs")
    employee = relationship("BiometricEmployee", back_populates="attendance_logs")

    def __repr__(self) -> str:
        return (
            f"<AttendanceLog(employee_id={self.employee_id}, "
            f"punch_time={self.punch_time}, type={self.punch_type})>"
        )
