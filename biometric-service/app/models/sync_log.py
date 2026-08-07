"""
DeviceSyncLog model — tracks device sync operations and their outcomes.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class SyncType(str, enum.Enum):
    """How the sync was triggered."""
    AUTO = "auto"
    MANUAL = "manual"
    RETRY = "retry"


class SyncStatus(str, enum.Enum):
    """Outcome of the sync operation."""
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"
    IN_PROGRESS = "in_progress"


class DeviceSyncLog(BaseModel):
    """
    Audit log of device synchronization operations.
    Tracks what was synced, how many records, and any errors.
    """

    __tablename__ = "device_sync_logs"

    # ── Device Reference ─────────────────────────────────────
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("biometric_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Sync Details ─────────────────────────────────────────
    sync_type: Mapped[SyncType] = mapped_column(
        Enum(SyncType, name="sync_type_enum", create_constraint=True),
        default=SyncType.AUTO,
    )
    status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, name="sync_status_enum", create_constraint=True),
        default=SyncStatus.IN_PROGRESS,
    )

    # ── Metrics ──────────────────────────────────────────────
    records_fetched: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
        comment="Total records retrieved from device",
    )
    records_new: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
        comment="New records stored (not duplicates)",
    )
    records_duplicate: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
        comment="Records skipped as duplicates",
    )

    # ── Error Tracking ───────────────────────────────────────
    error_message: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True,
    )
    retry_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"),
    )

    # ── Timing ───────────────────────────────────────────────
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()"),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Relationships ────────────────────────────────────────
    device = relationship("BiometricDevice", back_populates="sync_logs")

    def __repr__(self) -> str:
        return (
            f"<DeviceSyncLog(device_id={self.device_id}, "
            f"status={self.status}, new={self.records_new})>"
        )
