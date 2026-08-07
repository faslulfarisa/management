-- 032_biometric_sync_logs.sql
-- Operational audit log for every sync run: records fetched, synced, skipped
-- (dedup hits), failed, duration, and cursor before/after.
-- Used by dashboards and sync-lag alerting.
-- Run after 031_attendance_records_source.sql
-- SAFE: New table — no existing data touched.

CREATE TABLE IF NOT EXISTS biometric_sync_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL,
  integration_id   UUID        NOT NULL,
  provider_name    TEXT        NOT NULL,
  cursor_type      TEXT        NOT NULL,

  -- Watermark values before and after this run
  cursor_before    TEXT,
  cursor_after     TEXT,

  records_fetched  INTEGER     NOT NULL DEFAULT 0,
  records_synced   INTEGER     NOT NULL DEFAULT 0,
  records_skipped  INTEGER     NOT NULL DEFAULT 0,   -- deduplication hits
  records_failed   INTEGER     NOT NULL DEFAULT 0,

  duration_ms      INTEGER,

  status           TEXT        NOT NULL
    CHECK (status IN ('success', 'partial', 'failed')),

  -- Human-readable summary when status != 'success'
  error_summary    TEXT,

  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- Primary query: recent runs per tenant + provider for dashboards
CREATE INDEX IF NOT EXISTS idx_sync_logs_tenant_provider
  ON biometric_sync_logs (tenant_id, provider_name, started_at DESC);

-- Alert query: recent failures
CREATE INDEX IF NOT EXISTS idx_sync_logs_failed
  ON biometric_sync_logs (tenant_id, status, started_at DESC)
  WHERE status = 'failed';
