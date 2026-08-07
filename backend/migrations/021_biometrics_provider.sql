-- 021_biometrics_provider.sql
-- Biometric Provider Architecture: Schema extensions for multi-provider attendance
-- Run after 020_vendors.sql
-- SAFE: All changes are additive (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)

-- ── attendance_records: provider tracking columns ──────────────────────────

-- Which biometric provider generated this record
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS provider_name TEXT DEFAULT 'manual';

-- Device identifier (serial number / device ID) from the provider
-- NULL for providers that don't have discrete devices (e.g. EasyTimePro API)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS source_device_id TEXT;

-- Number of individual punch events that contributed to this session
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS punch_count INT DEFAULT 0;

-- Ordered punch sequence for audit trail: [{time, type, method, provider}]
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS punch_sequence JSONB;

-- Early departure in minutes (mirrors late_minutes on the checkout side)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS early_departure_minutes INT DEFAULT 0;

-- Whether this session crossed midnight (overnight shift)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS is_overnight BOOLEAN DEFAULT false;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_att_provider
  ON attendance_records(provider_name);

CREATE INDEX IF NOT EXISTS idx_att_device
  ON attendance_records(source_device_id)
  WHERE source_device_id IS NOT NULL;

-- ── Data Backfill ─────────────────────────────────────────────────────────────

-- Tag existing ZKTeco-sourced records so reports can filter by provider
UPDATE attendance_records
  SET provider_name = 'zkteco'
  WHERE provider_name IS NULL
    AND remarks LIKE '%ZKTeco%';

-- Tag existing manual clock-in/clock-out records
UPDATE attendance_records
  SET provider_name = 'manual'
  WHERE provider_name IS NULL;

-- ── integrations: EasyTimePro type constraint ─────────────────────────────────

-- Ensure the integrations table allows the 'easytimepro' type
-- (no schema constraint to add — type is TEXT — just a comment for clarity)
-- Supported values: 'zkteco', 'easytimepro', 'google_maps', 'whatsapp', 'email'

-- ── shift_definitions: overnight support ──────────────────────────────────────

-- Add is_overnight flag to shift_definitions if not present
-- The attendance engine uses this to correctly resolve punch dates for night shifts
ALTER TABLE shift_definitions
  ADD COLUMN IF NOT EXISTS is_overnight BOOLEAN DEFAULT false;

-- Auto-detect existing overnight shifts (end_time < start_time implies next day)
UPDATE shift_definitions
  SET is_overnight = true
  WHERE end_time < start_time
    AND is_overnight = false;

-- ── shift_assignments: date-range shift allocation ────────────────────────────

-- Ensure shift_assignments exists (added in 004_shifts.sql)
-- The engine now uses shift_assignments as a fallback when shift_schedules
-- has no per-day entry for an employee
CREATE INDEX IF NOT EXISTS idx_sa_date_range
  ON shift_assignments(employee_id, start_date, end_date)
  WHERE is_active = true;
