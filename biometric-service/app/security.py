"""
Security helpers for the biometric device adapter.

The Python service authenticates callers, validates request freshness,
prevents replay, and signs outbound callbacks. Attendance calculation remains
inside the NestJS HRMS backend.
"""

import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_session
from app.models.device import BiometricDevice

logger = logging.getLogger(__name__)

API_KEY_HEADERS = ("x-api-key", "x-hms-api-key")
SIGNATURE_HEADERS = ("x-signature", "x-hms-signature")
TIMESTAMP_HEADERS = ("x-timestamp", "x-hms-timestamp")
NONCE_HEADERS = ("x-nonce", "x-hms-nonce")
TENANT_HEADERS = ("x-tenant-id", "x-hms-tenant-id")
INTEGRATION_HEADERS = ("x-integration-id", "x-hms-integration-id")

_memory_nonces: dict[str, float] = {}


@dataclass(frozen=True)
class SecureRequestContext:
    tenant_id: Optional[str]
    integration_id: Optional[str]
    device_id: Optional[str]
    device_serial: Optional[str]


def canonical_body(body: bytes) -> bytes:
    if not body:
        return b""
    try:
        parsed = json.loads(body.decode("utf-8"))
    except Exception:
        return body
    return json.dumps(parsed, separators=(",", ":"), sort_keys=True).encode("utf-8")


def build_signature_message(
    method: str,
    path: str,
    query: str,
    timestamp: str,
    nonce: str,
    body: bytes,
) -> bytes:
    body_hash = hashlib.sha256(canonical_body(body)).hexdigest()
    return "\n".join([method.upper(), path, query, timestamp, nonce, body_hash]).encode("utf-8")


def sign_request(
    *,
    method: str,
    path: str,
    query: str = "",
    timestamp: str,
    nonce: str,
    body: bytes = b"",
    secret: str,
) -> str:
    message = build_signature_message(method, path, query, timestamp, nonce, body)
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def signed_headers(
    *,
    api_key: str,
    secret: str,
    method: str,
    path: str,
    query: str = "",
    body: bytes = b"",
    tenant_id: Optional[str] = None,
    integration_id: Optional[str] = None,
    nonce: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> dict[str, str]:
    timestamp = timestamp or str(int(time.time()))
    nonce = nonce or hashlib.sha256(f"{timestamp}:{time.time_ns()}".encode("utf-8")).hexdigest()
    headers = {
        "x-api-key": api_key,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": sign_request(
            method=method,
            path=path,
            query=query,
            timestamp=timestamp,
            nonce=nonce,
            body=body,
            secret=secret,
        ),
    }
    if tenant_id:
        headers["x-tenant-id"] = tenant_id
    if integration_id:
        headers["x-integration-id"] = integration_id
    return headers


def _header(request: Request, names: tuple[str, ...]) -> Optional[str]:
    for name in names:
        value = request.headers.get(name)
        if value:
            return value.strip()
    return None


def _extract_api_key(request: Request) -> Optional[str]:
    header_key = _header(request, API_KEY_HEADERS)
    if header_key:
        return header_key

    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _extract_payload_ids(payload: Any) -> dict[str, Optional[str]]:
    if not isinstance(payload, dict):
        return {"tenant_id": None, "integration_id": None, "device_serial": None}
    return {
        "tenant_id": payload.get("tenant_id") or payload.get("tenantId"),
        "integration_id": payload.get("integration_id") or payload.get("integrationId"),
        "device_serial": payload.get("device_sn") or payload.get("deviceSn") or payload.get("serial_number"),
    }


def _validate_uuid(value: Optional[str], field: str) -> Optional[str]:
    if not value:
        return None
    try:
        return str(UUID(str(value)))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field}") from exc


async def _remember_nonce(settings: Settings, api_key: str, nonce: str) -> None:
    now = time.time()
    ttl = settings.replay_nonce_ttl_seconds
    replay_key = f"biometric-adapter:nonce:{hashlib.sha256(api_key.encode()).hexdigest()}:{nonce}"

    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        inserted = await redis.set(replay_key, "1", ex=ttl, nx=True)
        await redis.aclose()
        if not inserted:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate request nonce")
        return
    except HTTPException:
        raise
    except Exception as exc:
        if settings.is_production:
            logger.error("Replay nonce store unavailable: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Replay protection unavailable",
            ) from exc
        logger.warning("Using in-memory replay nonce cache: %s", exc)

    expired = [key for key, expires_at in _memory_nonces.items() if expires_at <= now]
    for key in expired:
        _memory_nonces.pop(key, None)
    if replay_key in _memory_nonces:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate request nonce")
    _memory_nonces[replay_key] = now + ttl


async def verify_service_request(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> SecureRequestContext:
    api_key = _extract_api_key(request)
    if not api_key or not any(hmac.compare_digest(api_key, key) for key in settings.accepted_inbound_api_keys):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    timestamp = _header(request, TIMESTAMP_HEADERS)
    nonce = _header(request, NONCE_HEADERS)
    signature = _header(request, SIGNATURE_HEADERS)
    body = await request.body()

    signature_required = settings.require_request_signatures or settings.is_production
    if signature_required:
        if not timestamp or not nonce or not signature:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing request signature")

        try:
            request_time = int(timestamp)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid request timestamp") from exc

        if abs(int(time.time()) - request_time) > settings.request_timestamp_tolerance_seconds:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expired request timestamp")

        expected = sign_request(
            method=request.method,
            path=request.url.path,
            query=request.url.query,
            timestamp=timestamp,
            nonce=nonce,
            body=body,
            secret=settings.effective_signature_secret,
        )
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid request signature")

        await _remember_nonce(settings, api_key, nonce)

    payload_ids = {"tenant_id": None, "integration_id": None, "device_serial": None}
    if body:
        try:
            payload_ids = _extract_payload_ids(json.loads(body.decode("utf-8")))
        except Exception:
            pass

    tenant_id = _validate_uuid(
        _header(request, TENANT_HEADERS) or request.query_params.get("tenant_id") or payload_ids["tenant_id"],
        "tenant_id",
    )
    integration_id = _validate_uuid(
        _header(request, INTEGRATION_HEADERS)
        or request.query_params.get("integration_id")
        or payload_ids["integration_id"],
        "integration_id",
    )
    device_id = _validate_uuid(request.path_params.get("device_id"), "device_id")
    device_serial = request.query_params.get("device_sn") or payload_ids["device_serial"]

    device = None
    if device_id:
        result = await session.execute(select(BiometricDevice).where(BiometricDevice.id == UUID(device_id)))
        device = result.scalar_one_or_none()
    elif device_serial:
        result = await session.execute(select(BiometricDevice).where(BiometricDevice.serial_number == device_serial))
        device = result.scalar_one_or_none()

    if device:
        if not device.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive device")
        if tenant_id and str(device.tenant_id) != tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid tenant for device")
        tenant_id = str(device.tenant_id)
        config = device.config or {}
        configured_integration = config.get("integration_id") or config.get("integrationId")
        if integration_id and configured_integration and str(configured_integration) != integration_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid integration for device")
        if integration_id and config.get("integration_active") is False:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive integration")
    elif device_id or device_serial:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown device")

    return SecureRequestContext(
        tenant_id=tenant_id,
        integration_id=integration_id,
        device_id=device_id,
        device_serial=device_serial,
    )
