"""
Custom exception classes for the biometric attendance microservice.
"""

from typing import Any, Optional


class BiometricServiceError(Exception):
    """Base exception for the biometric service."""

    def __init__(self, message: str, details: Optional[Any] = None):
        self.message = message
        self.details = details
        super().__init__(self.message)


class DeviceConnectionError(BiometricServiceError):
    """Raised when unable to connect to a ZKTeco device."""

    def __init__(self, ip: str, port: int, reason: str = "Connection failed"):
        self.ip = ip
        self.port = port
        super().__init__(
            message=f"Cannot connect to device at {ip}:{port} — {reason}",
            details={"ip": ip, "port": port, "reason": reason},
        )


class DeviceNotFoundError(BiometricServiceError):
    """Raised when a device is not found in the database."""

    def __init__(self, device_id: str):
        super().__init__(
            message=f"Device not found: {device_id}",
            details={"device_id": device_id},
        )


class EmployeeNotFoundError(BiometricServiceError):
    """Raised when an employee is not found."""

    def __init__(self, identifier: str):
        super().__init__(
            message=f"Employee not found: {identifier}",
            details={"identifier": identifier},
        )


class SyncError(BiometricServiceError):
    """Raised when a sync operation fails."""

    def __init__(self, device_id: str, reason: str):
        super().__init__(
            message=f"Sync failed for device {device_id}: {reason}",
            details={"device_id": device_id, "reason": reason},
        )


class AttendanceProcessingError(BiometricServiceError):
    """Raised when the attendance processing engine encounters an error."""

    def __init__(self, reason: str, employee_id: Optional[str] = None):
        super().__init__(
            message=f"Attendance processing error: {reason}",
            details={"reason": reason, "employee_id": employee_id},
        )


class ShiftMatchError(BiometricServiceError):
    """Raised when no shift rule can be matched for an employee."""

    def __init__(self, employee_id: str):
        super().__init__(
            message=f"No active shift rule found for employee: {employee_id}",
            details={"employee_id": employee_id},
        )


class HMSCallbackError(BiometricServiceError):
    """Raised when the Ai-HRMS callback fails."""

    def __init__(self, url: str, status_code: Optional[int] = None, reason: str = ""):
        super().__init__(
            message=f"Ai-HRMS callback failed: {url} (status={status_code}) — {reason}",
            details={"url": url, "status_code": status_code, "reason": reason},
        )


class DuplicatePunchError(BiometricServiceError):
    """Raised when a duplicate punch is detected."""

    def __init__(self, employee_id: str, punch_time: str):
        super().__init__(
            message=f"Duplicate punch for employee {employee_id} at {punch_time}",
            details={"employee_id": employee_id, "punch_time": punch_time},
        )
