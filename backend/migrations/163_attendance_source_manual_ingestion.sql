-- 163_attendance_source_manual_ingestion.sql
-- Allows manual attendance punches to flow through the shared biometrics
-- ingestion model without violating the existing attendance_source check.
--
-- SAFE: constraint-only compatibility change. No production rows are removed
-- or rewritten.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname
    INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'attendance_records'::regclass
    AND c.contype = 'c'
    AND a.attname = 'attendance_source'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE attendance_records DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_attendance_source_check
    CHECK (attendance_source IS NULL OR attendance_source IN (
      'biometric_device',
      'face_device',
      'fingerprint_device',
      'card_device',
      'mobile_terminal',
      'tablet_terminal',
      'web_kiosk',
      'laptop_terminal',
      'kiosk_terminal',
      'manual_attendance'
    ));
END $$;
