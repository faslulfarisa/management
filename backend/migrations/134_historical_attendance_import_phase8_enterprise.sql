-- 134_historical_attendance_import_phase8_enterprise.sql
-- Phase 8: enterprise background execution, queue monitoring, and high-volume
-- staging/rebuild performance indexes.

ALTER TABLE historical_attendance_import_progress
  ADD COLUMN IF NOT EXISTS queue_job_id TEXT,
  ADD COLUMN IF NOT EXISTS chunks_processed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connector_cursor TEXT,
  ADD COLUMN IF NOT EXISTS connector_has_more BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS throughput_records_per_min NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS historical_attendance_import_execution_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES historical_attendance_import_batches(id) ON DELETE CASCADE,
  source_id UUID REFERENCES historical_attendance_import_sources(id),
  queue_job_id TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  requested_limit INT NOT NULL DEFAULT 1000,
  chunks_processed INT NOT NULL DEFAULT 0,
  records_processed INT NOT NULL DEFAULT 0,
  records_staged INT NOT NULL DEFAULT 0,
  records_failed INT NOT NULL DEFAULT 0,
  duplicate_records INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  connector_cursor TEXT,
  connector_has_more BOOLEAN NOT NULL DEFAULT false,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hai_execution_jobs_batch
  ON historical_attendance_import_execution_jobs(batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_execution_jobs_status
  ON historical_attendance_import_execution_jobs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_staging_batch_employee_punched
  ON historical_attendance_import_staging_rows(batch_id, mapped_employee_id, punched_at)
  WHERE mapped_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hai_staging_batch_punched_valid
  ON historical_attendance_import_staging_rows(batch_id, punched_at)
  WHERE status = 'staged';

CREATE INDEX IF NOT EXISTS idx_hai_reconciliation_batch_employee_date_action
  ON historical_attendance_import_reconciliation_results(batch_id, mapped_employee_id, punch_date, action)
  WHERE mapped_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hai_logs_batch_level_created
  ON historical_attendance_import_logs(batch_id, level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hai_progress_batch_updated
  ON historical_attendance_import_progress(batch_id, updated_at DESC);
