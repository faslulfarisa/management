-- 029_biometric_sync_cursors.sql
-- Per-integration, per-cursor-type watermarks for incremental sync.
-- Each row stores the last successfully processed cursor (ISO timestamp or
-- provider-native sequence ID) for a given (integration, cursor_type) pair.
-- Run after 028_attendance_terminals.sql
-- SAFE: New table — no existing data touched.

CREATE TABLE IF NOT EXISTS biometric_sync_cursors (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  integration_id  UUID        NOT NULL,
  provider_name   TEXT        NOT NULL,
  cursor_type     TEXT        NOT NULL
    CHECK (cursor_type IN ('attendance_logs', 'devices', 'employees')),

  -- The watermark value: ISO 8601 timestamp or provider sequence number.
  -- On failure the cursor is NOT advanced, so the next run re-fetches the same window.
  last_cursor     TEXT        NOT NULL,

  last_sync_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  records_synced  INTEGER     NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, integration_id, provider_name, cursor_type)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursors_lookup
  ON biometric_sync_cursors (tenant_id, integration_id, provider_name);
