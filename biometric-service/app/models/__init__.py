"""
Model package — exports all SQLAlchemy models.
Import this package to ensure all models are registered with Base.metadata.
"""

from app.models.base import BaseModel, TimestampMixin, TenantMixin
from app.models.device import BiometricDevice, DeviceType, ConnectionMode, DeviceStatus
from app.models.employee import BiometricEmployee
from app.models.attendance_log import AttendanceLog, PunchType, VerifyMethod
from app.models.attendance_session import AttendanceSession, AttendanceStatus
from app.models.sync_log import DeviceSyncLog, SyncType, SyncStatus
from app.models.shift_rule import ShiftRule

__all__ = [
    "BaseModel",
    "TimestampMixin",
    "TenantMixin",
    "BiometricDevice",
    "DeviceType",
    "ConnectionMode",
    "DeviceStatus",
    "BiometricEmployee",
    "AttendanceLog",
    "PunchType",
    "VerifyMethod",
    "AttendanceSession",
    "AttendanceStatus",
    "DeviceSyncLog",
    "SyncType",
    "SyncStatus",
    "ShiftRule",
]
