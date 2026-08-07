-- 033_biometric_device_lastseen.sql
-- Phase 6: adds device identity columns that the sync adapter produces but the
-- original Python schema may have omitted, plus a proper TIMESTAMPTZ
-- last_seen_at column that BiometricDeviceService uses for stale detection.
-- SAFE: ADD COLUMN IF NOT EXISTS throughout — no existing data touched.

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS firmware_version TEXT;

-- Dedicated heartbeat timestamp. sync_cursor on biometric_devices is a TEXT
-- watermark reserved for per-device attendance log cursors; last_seen_at is the
-- clean timestamp used by the stale-sweep cron and API filters.
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Backfill from sync_cursor for rows that already have a valid ISO-8601 value.
UPDATE biometric_devices
  SET last_seen_at = sync_cursor::timestamptz
  WHERE last_seen_at IS NULL
    AND sync_cursor IS NOT NULL
    AND sync_cursor ~ '^\d{4}-\d{2}-\d{2}T';

-- Supports stale-sweep and dashboard queries filtering by online + last seen.
CREATE INDEX IF NOT EXISTS idx_bio_devices_last_seen
  ON biometric_devices (tenant_id, last_seen_at)
  WHERE is_online = true;

-- Supports name-based search on the device list API.
CREATE INDEX IF NOT EXISTS idx_bio_devices_name
  ON biometric_devices (tenant_id, name)
  WHERE name IS NOT NULL;
