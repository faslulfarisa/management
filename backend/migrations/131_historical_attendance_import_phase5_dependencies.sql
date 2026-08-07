-- 131_historical_attendance_import_phase5_dependencies.sql
-- Phase 5: progress tracking for targeted downstream rebuilds after production
-- attendance has been rebuilt from historical imports.

CREATE TABLE IF NOT EXISTS historical_attendance_import_dependency_rebuild_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  attendance_rebuild_run_id UUID REFERENCES historical_attendance_import_rebuild_runs(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'completed_with_warnings', 'failed')),
  total_steps INT NOT NULL DEFAULT 0,
  completed_steps INT NOT NULL DEFAULT 0,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  affected_employees JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hai_dependency_rebuild_batch
  ON historical_attendance_import_dependency_rebuild_runs(batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_dependency_rebuild_attendance_run
  ON historical_attendance_import_dependency_rebuild_runs(attendance_rebuild_run_id);

CREATE INDEX IF NOT EXISTS idx_hai_dependency_rebuild_status
  ON historical_attendance_import_dependency_rebuild_runs(tenant_id, status, created_at DESC);
