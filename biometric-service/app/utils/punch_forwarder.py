"""
punch_forwarder.py

Forwards raw punch events from ZKTeco devices to the NestJS unified
biometric endpoint: POST /api/v1/biometrics/punch

Replaces the old HRMS callback client which pushed processed sessions.
The Python service now sends RAW punches only — all attendance calculation
logic lives exclusively in the NestJS HRMS backend.

Retry strategy: exponential backoff, up to max_retries attempts.
On persistent failure punches remain in attendance_logs with
is_forwarded=False and are retried on the next sync cycle.
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.security import signed_headers

logger = logging.getLogger(__name__)


def _to_iso(dt: Any) -> str:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


def _build_payload(device_sn: str, punches: list[dict]) -> dict:
    """
    Build the UnifiedPunchBody payload expected by NestJS BiometricsController.
    Matches the interface:
      { provider, deviceSn, punches: [{ employeeCode, timestamp, punchType }] }
    """
    return {
        "provider": "zkteco",
        "deviceSn": device_sn,
        "punches": [
            {
                "employeeCode": str(p["employee_code"]),
                "timestamp": _to_iso(p["punch_time"]),
                "punchType": str(p.get("punch_type", "0")),
            }
            for p in punches
        ],
    }


async def forward_punches(
    device_sn: str,
    punches: list[dict],
    tenant_api_key: str,
    max_retries: int = 3,
) -> bool:
    """
    Forward a batch of raw punches to NestJS.

    Returns True if NestJS acknowledged the batch (queued for processing).
    Returns False if all retry attempts failed — caller should leave
    is_forwarded=False so the next sync cycle retries.
    """
    if not punches:
        return True

    settings = get_settings()
    url = f"{settings.hms_base_url.rstrip('/')}/v1/biometrics/punch"
    payload = _build_payload(device_sn, punches)
    request_timestamp = datetime.now(timezone.utc).isoformat()
    nonce = hashlib.sha256(f"{device_sn}:{request_timestamp}:{datetime.now(timezone.utc).timestamp()}".encode()).hexdigest()
    payload["requestTimestamp"] = request_timestamp
    payload["nonce"] = nonce
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "x-service": "biometric-adapter",
        **signed_headers(
            api_key=tenant_api_key,
            secret=settings.effective_signature_secret,
            method="POST",
            path="/api/v1/biometrics/punch",
            body=body,
            nonce=nonce,
        ),
    }

    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
                resp = await client.post(url, content=body, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    logger.info(
                        "Forwarded %d punches from device %s (queued=%s)",
                        len(punches),
                        device_sn,
                        data.get("data", {}).get("queued"),
                    )
                    return True
                # NestJS returned 200 but success=false (e.g. unknown provider)
                logger.error(
                    "NestJS rejected punch batch for device %s: %s",
                    device_sn,
                    data.get("error"),
                )
                return False

            if resp.status_code >= 500:
                # Server error — worth retrying
                logger.warning(
                    "NestJS returned %d for device %s (attempt %d/%d)",
                    resp.status_code, device_sn, attempt, max_retries,
                )
            else:
                # 4xx — client error, no point retrying
                logger.error(
                    "NestJS returned %d for device %s: %s",
                    resp.status_code, device_sn, resp.text[:200],
                )
                return False

        except (httpx.TimeoutException, httpx.RequestError) as exc:
            logger.warning(
                "Forward attempt %d/%d failed for device %s: %s",
                attempt, max_retries, device_sn, exc,
            )

        if attempt < max_retries:
            wait = min(2 ** attempt, 30)
            await asyncio.sleep(wait)

    logger.error(
        "All %d forward attempts failed for device %s — "
        "punches will retry on next sync cycle",
        max_retries, device_sn,
    )
    return False
