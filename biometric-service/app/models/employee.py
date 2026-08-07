"""
BiometricEmployee model — maps Ai-HRMS employees to biometric device users.
"""

import uuid
from typing import Optional

from sqlalchemy import Boolean, Integer, String, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class BiometricEmployee(BaseModel):
    """
    Employee registration for biometric attendance.
    Links Ai-HRMS employees to their biometric device user IDs.
    """

    __tablename__ = "biometric_employees"

    # ── Ai-HRMS Link ─────────────────────────────────────────
    hms_employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True,
        comment="FK to Ai-HRMS core employees.id",
    )
    employee_code: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="Must match Ai-HRMS employee_code for sync",
    )

    # ── Device Enrollment ────────────────────────────────────
    device_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="User ID assigned on the ZKTeco device",
    )
    full_name: Mapped[str] = mapped_column(
        String(200), nullable=False,
    )

    # ── Biometric Status ─────────────────────────────────────
    fingerprint_registered: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
    )
    face_registered: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
    )
    card_number: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="RFID card number",
    )

    # ── Status ───────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"),
    )

    # ── Device Mapping ───────────────────────────────────────
    devices: Mapped[Optional[list]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=True, default=list,
        comment="Array of device IDs this employee is mapped to",
    )

    # ── Relationships ────────────────────────────────────────
    attendance_logs = relationship("AttendanceLog", back_populates="employee", lazy="dynamic")
    attendance_sessions = relationship("AttendanceSession", back_populates="employee", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<BiometricEmployee(code={self.employee_code!r}, name={self.full_name!r})>"
