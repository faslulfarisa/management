-- 022_punch_fingerprints.sql
-- Idempotent punch deduplication registry.
--
-- Prevents duplicate attendance records from:
--   - ADMS retries on network failure
--   - EasyTimePro polling overlap windows
--   - Python service retry backlog drains
--   - Manual re-syncs
--
-- Strategy: SHA-256 fingerprint of (tenant_id:employee_code:timestamp_minute:provider_name)
-- Minute-bucket granularity — two punches in the same minute from the same
-- employee + provider are treated as one event.
--
-- Run after: 021_biometrics_provider.sql
-- SAFE: fully additive, no existing table modifications.

CREATE TABLE IF NOT EXISTS punch_fingerprints (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,

  -- SHA-256 hex of "tenantId:EMPLOYEE_CODE:2026-05-29T09:05:00.000Z:zkteco"
  fingerprint          TEXT        NOT NULL,

  -- Denormalized for debugging without joining
  employee_code        TEXT        NOT NULL,
  provider_name        TEXT        NOT NULL,

  -- Timestamp normalized to minute precision (seconds/ms zeroed)
  punched_at           TIMESTAMPTZ NOT NULL,

  processed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Back-reference to the attendance record this punch contributed to.
  -- NULL until the engine upserts and links it.
  attendance_record_id UUID        REFERENCES attendance_records(id) ON DELETE SET NULL,

  CONSTRAINT uq_punch_fingerprint UNIQUE (tenant_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_pf_tenant_time
  ON punch_fingerprints (tenant_id, punched_at DESC);

CREATE INDEX IF NOT EXISTS idx_pf_employee
  ON punch_fingerprints (tenant_id, employee_code, punched_at DESC);

COMMENT ON TABLE punch_fingerprints IS
  'Deduplication registry — one row per unique punch event. '
  'Fingerprint = SHA-256(tenant_id:EMPLOYEE_CODE:minute_bucket_iso:provider_name). '
  'ON CONFLICT DO NOTHING is the primary dedup mechanism; this table is the gate.';
