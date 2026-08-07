"""
pyzk client wrapper — provides reliable ZKTeco device communication
with retry logic, timeout handling, and connection management.
"""

import logging
import time as time_module
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from app.config import get_settings
from app.utils.exceptions import DeviceConnectionError

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class ZKPunch:
    """Normalized punch record from a ZKTeco device."""
    user_id: int
    timestamp: datetime
    status: int           # 0=IN, 1=OUT (device-specific)
    punch_type: int       # verification method code
    uid: Optional[int] = None


@dataclass
class ZKUser:
    """User record from a ZKTeco device."""
    uid: int
    user_id: str          # The "enroll number" / employee code
    name: str
    privilege: int
    password: str = ""
    card: int = 0


@dataclass
class ZKDeviceInfo:
    """Device metadata from a ZKTeco device."""
    device_name: str
    serial_number: str
    firmware_version: str
    platform: str
    user_count: int
    log_count: int


class PyZKClient:
    """
    Thread-safe wrapper around the pyzk library.
    Handles connections, retries, and timeouts for ZKTeco devices.
    """

    def __init__(
        self,
        ip: str,
        port: int = 4370,
        timeout: int = None,
        max_retries: int = None,
    ):
        self.ip = ip
        self.port = port
        self.timeout = timeout or settings.pyzk_connect_timeout
        self.max_retries = max_retries or settings.pyzk_max_retries
        self._zk = None

    def _create_connection(self):
        """Create a new ZK connection instance."""
        try:
            from zk import ZK
        except ImportError:
            raise DeviceConnectionError(
                self.ip, self.port,
                "pyzk library not installed. Install with: pip install pyzk"
            )
        return ZK(
            self.ip,
            port=self.port,
            timeout=self.timeout,
            password=0,
            force_udp=False,
            ommit_ping=False,
        )

    def connect(self) -> bool:
        """
        Connect to the ZKTeco device with exponential backoff retry.
        Returns True if connection is successful.
        """
        last_error = None

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    f"Connecting to ZKTeco device at {self.ip}:{self.port} "
                    f"(attempt {attempt}/{self.max_retries})"
                )
                zk = self._create_connection()
                conn = zk.connect()
                if conn:
                    self._zk = zk
                    logger.info(f"Connected to ZKTeco device at {self.ip}:{self.port}")
                    return True
                else:
                    raise DeviceConnectionError(
                        self.ip, self.port, "Connection returned None"
                    )
            except DeviceConnectionError:
                raise
            except Exception as e:
                last_error = e
                wait_time = min(2 ** attempt, 30)  # Exponential backoff, max 30s
                logger.warning(
                    f"Connection attempt {attempt} failed for {self.ip}:{self.port}: {e}. "
                    f"Retrying in {wait_time}s..."
                )
                if attempt < self.max_retries:
                    time_module.sleep(wait_time)

        raise DeviceConnectionError(
            self.ip, self.port,
            f"All {self.max_retries} connection attempts failed. Last error: {last_error}"
        )

    def disconnect(self):
        """Safely disconnect from the device."""
        if self._zk:
            try:
                self._zk.disconnect()
                logger.info(f"Disconnected from ZKTeco device at {self.ip}:{self.port}")
            except Exception as e:
                logger.warning(f"Error disconnecting from {self.ip}:{self.port}: {e}")
            finally:
                self._zk = None

    def ping(self) -> Tuple[bool, Optional[float]]:
        """
        Test device connectivity. Returns (reachable, response_time_ms).
        """
        start = time_module.time()
        try:
            self.connect()
            elapsed = (time_module.time() - start) * 1000
            self.disconnect()
            return True, round(elapsed, 2)
        except Exception as e:
            elapsed = (time_module.time() - start) * 1000
            logger.error(f"Ping failed for {self.ip}:{self.port}: {e}")
            return False, round(elapsed, 2)

    def get_device_info(self) -> Optional[ZKDeviceInfo]:
        """Fetch device metadata."""
        if not self._zk:
            self.connect()

        try:
            device_name = self._zk.get_device_name() or "Unknown"
            serial = self._zk.get_serialnumber() or "Unknown"
            firmware = self._zk.get_firmware_version() or "Unknown"
            platform = self._zk.get_platform() or "Unknown"

            users = self._zk.get_users() or []
            logs = self._zk.get_attendance() or []

            return ZKDeviceInfo(
                device_name=device_name,
                serial_number=serial,
                firmware_version=firmware,
                platform=platform,
                user_count=len(users),
                log_count=len(logs),
            )
        except Exception as e:
            logger.error(f"Failed to get device info from {self.ip}:{self.port}: {e}")
            return None

    def get_users(self) -> List[ZKUser]:
        """Fetch all enrolled users from the device."""
        if not self._zk:
            self.connect()

        try:
            users = self._zk.get_users() or []
            return [
                ZKUser(
                    uid=u.uid,
                    user_id=str(u.user_id),
                    name=u.name or "",
                    privilege=u.privilege,
                    password=u.password or "",
                    card=u.card or 0,
                )
                for u in users
            ]
        except Exception as e:
            logger.error(f"Failed to get users from {self.ip}:{self.port}: {e}")
            return []

    def get_attendance(self) -> List[ZKPunch]:
        """Fetch all attendance logs from the device."""
        if not self._zk:
            self.connect()

        try:
            logs = self._zk.get_attendance() or []
            punches = []

            for log in logs:
                try:
                    punch = ZKPunch(
                        user_id=int(log.user_id) if log.user_id else 0,
                        timestamp=log.timestamp if isinstance(log.timestamp, datetime)
                            else datetime.strptime(str(log.timestamp), "%Y-%m-%d %H:%M:%S"),
                        status=log.status if hasattr(log, "status") else 0,
                        punch_type=log.punch if hasattr(log, "punch") else 0,
                        uid=log.uid if hasattr(log, "uid") else None,
                    )
                    punches.append(punch)
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Skipping malformed punch record: {e}")
                    continue

            logger.info(f"Fetched {len(punches)} attendance records from {self.ip}:{self.port}")
            return punches
        except Exception as e:
            logger.error(f"Failed to get attendance from {self.ip}:{self.port}: {e}")
            raise DeviceConnectionError(
                self.ip, self.port,
                f"Failed to fetch attendance logs: {e}"
            )

    def clear_attendance(self) -> bool:
        """
        Clear attendance logs from the device.
        WARNING: Only call after successful sync and verification.
        """
        if not self._zk:
            self.connect()

        try:
            self._zk.clear_attendance()
            logger.info(f"Cleared attendance logs on device at {self.ip}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to clear attendance on {self.ip}:{self.port}: {e}")
            return False

    def __enter__(self):
        """Context manager support."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager cleanup."""
        self.disconnect()
        return False
