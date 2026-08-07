-- 024_service_api_keys.sql
-- Service-to-service API keys for machine-to-machine auth.
-- Used by the biometric-adapter (Python) to call POST /api/biometrics/punch
-- without requiring a user JWT.
--
-- Raw keys are never stored — only their SHA-256 hash.
-- Run after: 023_attendance_audit.sql
-- SAFE: fully additive.

CREATE TABLE IF NOT EXISTS service_api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,  -- SHA-256(raw_key) hex digest
  name         TEXT        NOT NULL,         -- human label, e.g. "biometric-adapter"
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_api_keys_tenant
  ON service_api_keys (tenant_id);

-- Partial index: only active keys need fast hash lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_api_keys_hash_active
  ON service_api_keys (key_hash)
  WHERE is_active = true;

COMMENT ON TABLE service_api_keys IS
  'SHA-256-hashed API keys for machine-to-machine auth. '
  'Raw keys are shown exactly once at creation time and never stored.';
