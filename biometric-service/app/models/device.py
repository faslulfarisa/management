"""
BiometricDevice model — represents a registered ZKTeco biometric device.
"""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Enum,
    Integer,
    String,
    Text,
    DateTime,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class DeviceType(str, enum.Enum):
    """Whether the device is used for check-in, check-out, or both."""
    IN = "IN"
    OUT = "OUT"
    BOTH = "BOTH"


class ConnectionMode(str, enum.Enum):
    """How the service communicates with the device."""
    PULL = "PULL"   # pyzk TCP connection (server pulls from device)
    PUSH = "PUSH"   # ADMS HTTP push (device pushes to server)


class DeviceStatus(str, enum.Enum):
    """Current device connectivity status."""
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"


class BiometricDevice(BaseModel):
    """ZKTeco biometric device registration and status tracking."""

    __tablename__ = "biometric_devices"

    # ── Identity ─────────────────────────────────────────────
    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Human-readable device name",
    )
    serial_number: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True,
        comment="Unique device serial number",
    )

    # ── Network ──────────────────────────────────────────────
    ip_address: Mapped[str] = mapped_column(
        String(45), nullable=False,
        comment="Device IP address",
    )
    port: Mapped[int] = mapped_column(
        Integer, default=4370, server_default=text("4370"),
        comment="Device communication port",
    )

    # ── Device Info ──────────────────────────────────────────
    model: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
        comment="Device model e.g. ZK-IN01-A, K40",
    )
    firmware_version: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True,
    )
    location: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True,
        comment="Physical location description",
    )

    # ── Classification ───────────────────────────────────────
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
        comment="Branch within tenant for multi-branch support",
    )
    device_type: Mapped[DeviceType] = mapped_column(
        Enum(DeviceType, name="device_type_enum", create_constraint=True),
        default=DeviceType.BOTH,
        server_default=text("'BOTH'"),
    )
    connection_mode: Mapped[ConnectionMode] = mapped_column(
        Enum(ConnectionMode, name="connection_mode_enum", create_constraint=True),
        default=ConnectionMode.PULL,
        server_default=text("'PULL'"),
    )

    # ── Status ───────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"),
    )
    status: Mapped[DeviceStatus] = mapped_column(
        Enum(DeviceStatus, name="device_status_enum", create_constraint=True),
        default=DeviceStatus.OFFLINE,
        server_default=text("'offline'"),
    )
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Extra Config ─────────────────────────────────────────
    config: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=dict,
        comment="Additional device configuration",
    )

    # ── Relationships ────────────────────────────────────────
    sync_logs = relationship("DeviceSyncLog", back_populates="device", lazy="dynamic")
    attendance_logs = relationship("AttendanceLog", back_populates="device", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<BiometricDevice(name={self.name!r}, sn={self.serial_number!r}, status={self.status})>"
