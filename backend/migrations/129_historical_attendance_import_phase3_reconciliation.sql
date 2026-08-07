-- 129_historical_attendance_import_phase3_reconciliation.sql
-- Phase 3: read-only reconciliation preview for validated historical punches.
-- Results are stored in import metadata only; production attendance_records are
-- never inserted, updated, or deleted by this phase.

CREATE TABLE IF NOT EXISTS historical_attendance_import_reconciliation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  staging_row_id UUID NOT NULL REFERENCES historical_attendance_import_staging_rows(id) ON DELETE CASCADE,
  mapped_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  existing_attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  duplicate_of_staging_row_id UUID REFERENCES historical_attendance_import_staging_rows(id) ON DELETE SET NULL,
  duplicate_of_attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  punch_date DATE,
  punch_time TIMESTAMPTZ,
  punch_direction VARCHAR(16),
  source_type VARCHAR(32),
  source_name TEXT,
  source_rank INT NOT NULL DEFAULT 100,
  action VARCHAR(24) NOT NULL CHECK (action IN (
    'create',
    'update',
    'unchanged',
    'duplicate',
    'rejected',
    'unknown_employee',
    'conflict'
  )),
  attendance_impact VARCHAR(16) NOT NULL CHECK (attendance_impact IN ('create', 'update', 'unchanged', 'none')),
  conflict_type TEXT,
  tolerance_minutes INT NOT NULL DEFAULT 5,
  source_priority JSONB NOT NULL DEFAULT '[]'::jsonb,
  merge_suggestion JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staging_row_id)
);

CREATE INDEX IF NOT EXISTS idx_hai_reconciliation_batch_action
  ON historical_attendance_import_reconciliation_results(batch_id, action);

CREATE INDEX IF NOT EXISTS idx_hai_reconciliation_batch_impact
  ON historical_attendance_import_reconciliation_results(batch_id, attendance_impact);

CREATE INDEX IF NOT EXISTS idx_hai_reconciliation_employee_date
  ON historical_attendance_import_reconciliation_results(tenant_id, mapped_employee_id, punch_date)
  WHERE mapped_employee_id IS NOT NULL;
