-- 035_reports_infrastructure.sql
-- Phase 11: Report export audit log table

CREATE TABLE IF NOT EXISTS report_export_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL,
  report_type     TEXT NOT NULL,
  export_format   TEXT NOT NULL DEFAULT 'csv',
  filters_applied JSONB NOT NULL DEFAULT '{}',
  row_count       INTEGER,
  exported_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_report_export_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_report_export_logs_tenant
  ON report_export_logs (tenant_id, exported_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_export_logs_user
  ON report_export_logs (tenant_id, user_id, exported_at DESC);
