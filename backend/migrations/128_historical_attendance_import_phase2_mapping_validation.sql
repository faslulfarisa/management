-- 128_historical_attendance_import_phase2_mapping_validation.sql
-- Phase 2: employee mapping, unknown user queue, validation state, and preview
-- metadata for historical attendance imports. No production attendance rows are
-- modified by this migration or the Phase 2 services.

ALTER TABLE historical_attendance_import_staging_rows
  ADD COLUMN IF NOT EXISTS identifier_candidates JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mapped_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_mapping_id UUID,
  ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(24) NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped', 'auto_matched', 'manual_mapped', 'conflict', 'unknown', 'approved')),
  ADD COLUMN IF NOT EXISTS mapping_method VARCHAR(32)
    CHECK (mapping_method IN ('employee_code', 'device_user_id', 'card_number', 'biometric_employee_id', 'pin', 'device_code', 'manual')),
  ADD COLUMN IF NOT EXISTS mapping_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS mapping_notes TEXT,
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'warning', 'error', 'rejected')),
  ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS duplicate_of_row_id UUID REFERENCES historical_attendance_import_staging_rows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_hai_staging_mapping_status
  ON historical_attendance_import_staging_rows(batch_id, mapping_status);

CREATE INDEX IF NOT EXISTS idx_hai_staging_mapped_employee
  ON historical_attendance_import_staging_rows(batch_id, mapped_employee_id)
  WHERE mapped_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hai_staging_validation_status
  ON historical_attendance_import_staging_rows(batch_id, validation_status);

CREATE TABLE IF NOT EXISTS historical_attendance_import_employee_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_identifier_type VARCHAR(32) NOT NULL CHECK (source_identifier_type IN (
    'employee_code',
    'device_user_id',
    'card_number',
    'biometric_employee_id',
    'pin',
    'device_code',
    'manual'
  )),
  source_identifier TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  mapping_method VARCHAR(32) NOT NULL CHECK (mapping_method IN ('automatic', 'manual')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'conflict')),
  match_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hai_employee_mappings_source
  ON historical_attendance_import_employee_mappings(tenant_id, source_id, source_identifier_type, source_identifier)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hai_employee_mappings_batch
  ON historical_attendance_import_employee_mappings(batch_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hai_employee_mappings_employee
  ON historical_attendance_import_employee_mappings(tenant_id, employee_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_unknown_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id) ON DELETE CASCADE,
  source_identifier_type VARCHAR(32) NOT NULL CHECK (source_identifier_type IN (
    'employee_code',
    'device_user_id',
    'card_number',
    'biometric_employee_id',
    'pin',
    'device_code',
    'manual',
    'unknown'
  )),
  source_identifier TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INT NOT NULL DEFAULT 1,
  candidate_count INT NOT NULL DEFAULT 0,
  best_candidate_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  best_confidence NUMERIC(5,4),
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_mapping_id UUID REFERENCES historical_attendance_import_employee_mappings(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_identifier_type, source_identifier)
);

CREATE INDEX IF NOT EXISTS idx_hai_unknown_users_batch_status
  ON historical_attendance_import_unknown_users(batch_id, status, row_count DESC);

CREATE TABLE IF NOT EXISTS historical_attendance_import_validation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  staging_row_id UUID NOT NULL REFERENCES historical_attendance_import_staging_rows(id) ON DELETE CASCADE,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('warning', 'error')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hai_validation_results_row
  ON historical_attendance_import_validation_results(staging_row_id);

CREATE INDEX IF NOT EXISTS idx_hai_validation_results_batch
  ON historical_attendance_import_validation_results(batch_id, severity, code);
