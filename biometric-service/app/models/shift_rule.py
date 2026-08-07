"""
ShiftRule model — defines work shifts with timing, grace periods, and overtime rules.
"""

from datetime import time
from typing import Optional

from sqlalchemy import (
    Boolean,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ShiftRule(BaseModel):
    """
    Shift configuration that governs attendance calculations.
    Each rule defines expected work hours, grace periods, and overtime thresholds.
    """

    __tablename__ = "shift_rules"

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_shift_rule_code"),
    )

    # ── Identity ─────────────────────────────────────────────
    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="e.g. Morning Shift, Night Shift",
    )
    code: Mapped[str] = mapped_column(
        String(20), nullable=False,
        comment="Short code e.g. MS, NS, GS",
    )

    # ── Timing ───────────────────────────────────────────────
    start_time: Mapped[time] = mapped_column(
        Time, nullable=False,
        comment="Shift start time e.g. 09:00",
    )
    end_time: Mapped[time] = mapped_column(
        Time, nullable=False,
        comment="Shift end time e.g. 18:00",
    )
    is_overnight: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"),
        comment="True if end_time < start_time (crosses midnight)",
    )

    # ── Break ────────────────────────────────────────────────
    break_minutes: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
        comment="Total break time in minutes",
    )

    # ── Grace Periods ────────────────────────────────────────
    grace_period_in: Mapped[int] = mapped_column(
        Integer, default=15, server_default=text("15"),
        comment="Late arrival tolerance in minutes",
    )
    grace_period_out: Mapped[int] = mapped_column(
        Integer, default=15, server_default=text("15"),
        comment="Early departure tolerance in minutes",
    )

    # ── Overtime ─────────────────────────────────────────────
    overtime_threshold_minutes: Mapped[int] = mapped_column(
        Integer, default=30, server_default=text("30"),
        comment="Minimum extra minutes before overtime is counted",
    )
    max_overtime_minutes: Mapped[int] = mapped_column(
        Integer, default=240, server_default=text("240"),
        comment="Maximum daily overtime cap (4 hours default)",
    )

    # ── Work Requirements ────────────────────────────────────
    half_day_threshold_minutes: Mapped[int] = mapped_column(
        Integer, default=240, server_default=text("240"),
        comment="Minimum work minutes to qualify as half-day (4 hours)",
    )
    min_work_hours: Mapped[float] = mapped_column(
        Numeric(4, 2), default=8.0, server_default=text("8.0"),
        comment="Required work hours for full-day credit",
    )

    # ── Status ───────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"),
    )

    # ── Relationships ────────────────────────────────────────
    attendance_sessions = relationship("AttendanceSession", back_populates="shift_rule", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<ShiftRule(name={self.name!r}, {self.start_time}-{self.end_time})>"
