-- 031_attendance_records_source.sql
-- Adds attendance source tracking and verification method columns to
-- attendance_records. Also adds foreign keys to biometric_devices and
-- attendance_terminals for device-level traceability.
-- Run after 030_verification_method_mappings.sql
-- SAFE: All changes are ADD COLUMN IF NOT EXISTS — no rows dropped, no defaults changed.

-- How the employee was biometrically verified for this session
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS verify_method TEXT
    CHECK (verify_method IN ('fingerprint', 'face', 'card', 'password', 'hybrid', 'other'));

-- Source category of the attendance event
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS attendance_source TEXT
    CHECK (attendance_source IN (
      'biometric_device',
      'face_device',
      'fingerprint_device',
      'card_device',
      'mobile_terminal',
      'laptop_terminal',
      'kiosk_terminal'
    ));

-- FK to attendance_terminals when punch came from a trusted software terminal
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS terminal_id UUID
    REFERENCES attendance_terminals(id) ON DELETE SET NULL;

-- FK to biometric_devices when the hardware device has been synced into the registry
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS biometric_device_id UUID
    REFERENCES biometric_devices(id) ON DELETE SET NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_att_verify_method
  ON attendance_records (tenant_id, verify_method)
  WHERE verify_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_att_source
  ON attendance_records (tenant_id, attendance_source)
  WHERE attendance_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_att_terminal
  ON attendance_records (terminal_id)
  WHERE terminal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_att_biometric_device
  ON attendance_records (biometric_device_id)
  WHERE biometric_device_id IS NOT NULL;
