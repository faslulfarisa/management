-- 132_historical_attendance_import_phase6_rollback.sql
-- Phase 6: reversible import commits, rollback metadata, lifecycle controls,
-- and organization import history support.

ALTER TABLE historical_attendance_import_batches
  DROP CONSTRAINT IF EXISTS historical_attendance_import_batches_status_check;

ALTER TABLE historical_attendance_import_batches
  ADD CONSTRAINT historical_attendance_import_batches_status_check
  CHECK (status IN (
    'draft',
    'uploading',
    'processing',
    'validation',
    'ready',
    'paused',
    'completed',
    'rolling_back',
    'rolled_back',
    'cancelled',
    'failed'
  ));

ALTER TABLE historical_attendance_import_batches
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(24) NOT NULL DEFAULT 'not_started'
    CHECK (rollback_status IN ('not_started', 'available', 'in_progress', 'rolled_back', 'failed', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS rollback_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS historical_attendance_import_commits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  rebuild_run_id UUID NOT NULL REFERENCES historical_attendance_import_rebuild_runs(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  status VARCHAR(24) NOT NULL DEFAULT 'committing'
    CHECK (status IN ('committing', 'committed', 'rolling_back', 'rolled_back', 'rollback_failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  import_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  committed_at TIMESTAMPTZ,
  duration_ms INT,
  rolled_back_by UUID REFERENCES users(id),
  rolled_back_at TIMESTAMPTZ,
  rollback_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id)
);

CREATE INDEX IF NOT EXISTS idx_hai_commits_tenant_status
  ON historical_attendance_import_commits(tenant_id, status, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_commits_rebuild_run
  ON historical_attendance_import_commits(rebuild_run_id);

CREATE TABLE IF NOT EXISTS historical_attendance_import_commit_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES historical_attendance_import_commits(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  rebuild_run_id UUID NOT NULL REFERENCES historical_attendance_import_rebuild_runs(id) ON DELETE CASCADE,
  entity_type VARCHAR(40) NOT NULL CHECK (entity_type IN (
    'attendance_record',
    'break_session',
    'payroll_attendance_summary'
  )),
  entity_id UUID,
  entity_key TEXT NOT NULL,
  previous_record JSONB,
  current_record JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commit_id, entity_type, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_hai_commit_snapshots_commit_type
  ON historical_attendance_import_commit_snapshots(commit_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_hai_commit_snapshots_entity
  ON historical_attendance_import_commit_snapshots(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS historical_attendance_import_rollback_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  commit_id UUID NOT NULL REFERENCES historical_attendance_import_commits(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
  total_steps INT NOT NULL DEFAULT 0,
  completed_steps INT NOT NULL DEFAULT 0,
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  restored_attendance_records INT NOT NULL DEFAULT 0,
  deleted_attendance_records INT NOT NULL DEFAULT 0,
  restored_break_sessions INT NOT NULL DEFAULT 0,
  restored_summaries INT NOT NULL DEFAULT 0,
  deleted_summaries INT NOT NULL DEFAULT 0,
  affected_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hai_rollback_runs_batch
  ON historical_attendance_import_rollback_runs(batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_rollback_runs_commit
  ON historical_attendance_import_rollback_runs(commit_id, created_at DESC);

ALTER TABLE historical_attendance_import_attendance_links
  ADD COLUMN IF NOT EXISTS commit_id UUID REFERENCES historical_attendance_import_commits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hai_attendance_links_commit
  ON historical_attendance_import_attendance_links(commit_id)
  WHERE commit_id IS NOT NULL;
