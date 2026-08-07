-- 133_historical_attendance_import_phase7_connectors.sql
-- Phase 7: production connector source types for historical attendance import.

ALTER TABLE historical_attendance_import_sources
  DROP CONSTRAINT IF EXISTS historical_attendance_import_sources_source_type_check;

ALTER TABLE historical_attendance_import_sources
  ADD CONSTRAINT historical_attendance_import_sources_source_type_check
  CHECK (source_type IN (
    'device',
    'vendor_software',
    'easytime_pro',
    'zkteco',
    'rest_api',
    'sql_database',
    'sql_server',
    'postgresql',
    'mysql',
    'csv',
    'sdk'
  ));
