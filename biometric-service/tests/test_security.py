import time

import pytest

from app.config import Settings, validate_startup_security
from app.security import canonical_body, sign_request, signed_headers


def test_signature_is_stable_for_json_key_order():
    body_a = b'{"b":2,"a":1}'
    body_b = b'{"a":1,"b":2}'

    assert canonical_body(body_a) == canonical_body(body_b)

    sig_a = sign_request(
        method="POST",
        path="/api/v1/devices",
        query="",
        timestamp="1800000000",
        nonce="nonce-1",
        body=body_a,
        secret="super-secret-value",
    )
    sig_b = sign_request(
        method="POST",
        path="/api/v1/devices",
        query="",
        timestamp="1800000000",
        nonce="nonce-1",
        body=body_b,
        secret="super-secret-value",
    )

    assert sig_a == sig_b


def test_signed_headers_include_api_key_timestamp_nonce_and_signature():
    headers = signed_headers(
        api_key="adapter-api-key",
        secret="adapter-signature-secret",
        method="POST",
        path="/api/v1/biometrics/punch",
        body=b'{"deviceSn":"SN-1","punches":[]}',
        tenant_id="11111111-1111-1111-1111-111111111111",
    )

    assert headers["x-api-key"] == "adapter-api-key"
    assert headers["x-tenant-id"] == "11111111-1111-1111-1111-111111111111"
    assert int(headers["x-timestamp"]) <= int(time.time())
    assert len(headers["x-nonce"]) >= 32
    assert len(headers["x-signature"]) == 64


def test_production_rejects_default_api_key():
    settings = Settings(
        environment="production",
        hms_api_key="biometric-service-key-change-in-production",
        inbound_api_keys="biometric-service-key-change-in-production",
        request_signature_secret="prod-signature-secret-prod-signature-secret",
        require_request_signatures=True,
    )

    with pytest.raises(RuntimeError, match="Unsafe biometric service API key"):
        validate_startup_security(settings)


def test_production_requires_request_signatures():
    settings = Settings(
        environment="production",
        hms_api_key="prod-api-key-prod-api-key-prod-api-key",
        inbound_api_keys="prod-api-key-prod-api-key-prod-api-key",
        request_signature_secret="prod-signature-secret-prod-signature-secret",
        require_request_signatures=False,
    )

    with pytest.raises(RuntimeError, match="Request signatures"):
        validate_startup_security(settings)


def test_production_accepts_strong_signed_configuration():
    settings = Settings(
        environment="production",
        hms_api_key="prod-api-key-prod-api-key-prod-api-key",
        inbound_api_keys="prod-api-key-prod-api-key-prod-api-key",
        request_signature_secret="prod-signature-secret-prod-signature-secret",
        require_request_signatures=True,
    )

    validate_startup_security(settings)
