"""
Ai-HRMS callback client — pushes processed attendance data to Ai-HRMS core
via the existing REST API endpoint.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

from app.config import get_settings
from app.utils.exceptions import HMSCallbackError

logger = logging.getLogger(__name__)
settings = get_settings()


class HMSCallbackClient:
    """
    HTTP client for pushing attendance data to Ai-HRMS core.
    Uses the existing POST /api/integrations/zkteco/punch endpoint.
    """

    def __init__(self):
        self.base_url = settings.hms_base_url.rstrip("/")
        self.api_key = settings.hms_api_key
        self.enabled = settings.hms_callback_enabled
        self.timeout = httpx.Timeout(30.0, connect=10.0)

    def _get_headers(self) -> Dict[str, str]:
        """Build request headers with API key authentication."""
        return {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Service": "biometric-attendance-service",
        }

    async def push_attendance(
        self,
        device_sn: str,
        punches: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """
        Push processed attendance punches to Ai-HRMS core.

        Args:
            device_sn: Device serial number
            punches: List of {"employeeCode": "EMP001", "timestamp": "2026-05-26T09:05:00"}

        Returns:
            Ai-HRMS response payload
        """
        if not self.enabled:
            logger.debug("Ai-HRMS callback disabled, skipping push")
            return {"success": True, "skipped": True, "reason": "callback_disabled"}

        url = f"{self.base_url}/integrations/zkteco/punch"
        payload = {
            "deviceSn": device_sn,
            "punches": punches,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._get_headers(),
                )

                if response.status_code == 200:
                    result = response.json()
                    logger.info(
                        f"Ai-HRMS callback success: device={device_sn}, "
                        f"synced={result.get('data', {}).get('synced', 0)} records"
                    )
                    return result
                else:
                    raise HMSCallbackError(
                        url=url,
                        status_code=response.status_code,
                        reason=response.text[:500],
                    )

        except httpx.TimeoutException as e:
            logger.error(f"Ai-HRMS callback timeout: {url} — {e}")
            raise HMSCallbackError(url=url, reason=f"Timeout: {e}")
        except httpx.RequestError as e:
            logger.error(f"Ai-HRMS callback request error: {url} — {e}")
            raise HMSCallbackError(url=url, reason=f"Request error: {e}")

    async def push_attendance_batch(
        self,
        sessions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Push multiple attendance sessions to Ai-HRMS in batch.
        Groups by device serial number for efficient delivery.

        Args:
            sessions: List of processed session dicts with device_sn and punch data

        Returns:
            Aggregate result
        """
        if not self.enabled:
            return {"success": True, "skipped": True, "total": len(sessions)}

        # Group punches by device serial
        device_punches: Dict[str, List[Dict[str, str]]] = {}
        for session in sessions:
            sn = session.get("device_sn", "UNKNOWN")
            if sn not in device_punches:
                device_punches[sn] = []
            device_punches[sn].append({
                "employeeCode": session["employee_code"],
                "timestamp": session["first_in"],
            })
            if session.get("last_out"):
                device_punches[sn].append({
                    "employeeCode": session["employee_code"],
                    "timestamp": session["last_out"],
                })

        results = {
            "success": True,
            "total_devices": len(device_punches),
            "total_punches": sum(len(p) for p in device_punches.values()),
            "succeeded": 0,
            "failed": 0,
            "errors": [],
        }

        for device_sn, punches in device_punches.items():
            try:
                await self.push_attendance(device_sn, punches)
                results["succeeded"] += 1
            except HMSCallbackError as e:
                results["failed"] += 1
                results["errors"].append(str(e))
                logger.error(f"Failed to push to Ai-HRMS for device {device_sn}: {e}")

        results["success"] = results["failed"] == 0
        return results

    async def health_check(self) -> bool:
        """Check if Ai-HRMS core is reachable."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(
                    f"{self.base_url}/../health",
                    headers=self._get_headers(),
                )
                return response.status_code == 200
        except Exception:
            return False


# Module-level singleton
hms_client = HMSCallbackClient()
