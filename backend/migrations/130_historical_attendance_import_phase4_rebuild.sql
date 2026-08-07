-- 130_historical_attendance_import_phase4_rebuild.sql
-- Phase 4: production attendance rebuild runs and idempotency links.
-- Production attendance writes are performed only by the rebuild service after
-- a summary run exists and payroll/correction blockers have been checked.

CREATE TABLE IF NOT EXISTS historical_attendance_import_rebuild_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'summary'
    CHECK (status IN ('summary', 'committing', 'committed', 'failed', 'cancelled')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id),
  committed_by UUID REFERENCES users(id),
  committed_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hai_rebuild_runs_batch
  ON historical_attendance_import_rebuild_runs(batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_rebuild_runs_status
  ON historical_attendance_import_rebuild_runs(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS historical_attendance_import_attendance_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  rebuild_run_id UUID NOT NULL REFERENCES historical_attendance_import_rebuild_runs(id) ON DELETE CASCADE,
  staging_row_id UUID NOT NULL REFERENCES historical_attendance_import_staging_rows(id) ON DELETE CASCADE,
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  applied_action VARCHAR(24) NOT NULL CHECK (applied_action IN ('create', 'update', 'unchanged')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staging_row_id)
);

CREATE INDEX IF NOT EXISTS idx_hai_attendance_links_batch
  ON historical_attendance_import_attendance_links(batch_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_attendance_links_record
  ON historical_attendance_import_attendance_links(attendance_record_id);
