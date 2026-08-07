-- 027_biometric_devices.sql
-- Extends the existing biometric_devices table (created by the Python/Alembic
-- biometric-adapter service) with Ai-HRMS-side columns needed for provider mapping,
-- capability tracking, incremental sync cursors, and online/offline monitoring.
-- Run after 026_attendance_indexes.sql
-- SAFE: All ADD COLUMN IF NOT EXISTS — no existing rows or columns touched.

-- Which Ai-HRMS provider manages this device ('easytimepro', 'zkteco', etc.)
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS provider_name TEXT NOT NULL DEFAULT 'unknown';

-- Original device ID as it appears in the provider system (ETP/ZKTeco DB)
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS provider_device_id TEXT;

-- Hardware capability type — separate from the existing device_type_enum
-- which tracks punch direction (IN/OUT/BOTH).
-- Values: fingerprint | face | card | hybrid | unknown
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS hardware_type TEXT
    CHECK (hardware_type IN ('fingerprint', 'face', 'card', 'hybrid', 'unknown'));

-- JSON array of capabilities, e.g. ["fingerprint", "card"]
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '[]';

-- Firmware platform string (e.g. 'ZEM800', 'ProBio', 'iClock')
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS platform TEXT;

-- Derived online flag — true when status = 'online' / last heartbeat recent
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;

-- ISO watermark for per-device incremental sync (used when devices expose
-- individual log cursors; falls back to integration-level cursor otherwise)
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT;

-- Freeform metadata (purchase info, location notes, etc.)
ALTER TABLE biometric_devices
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- ── Unique constraint ─────────────────────────────────────────────────────────
-- Prevent duplicate registrations of the same physical device per provider.
-- Uses a partial index because provider_name was NULL before this migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bio_devices_tenant_serial_provider
  ON biometric_devices (tenant_id, serial_number, provider_name);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bio_devices_tenant_active
  ON biometric_devices (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_bio_devices_provider
  ON biometric_devices (tenant_id, provider_name);

CREATE INDEX IF NOT EXISTS idx_bio_devices_online
  ON biometric_devices (tenant_id, is_online)
  WHERE is_online = true;
