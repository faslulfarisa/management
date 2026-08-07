-- 060_saved_reports.sql
-- Saved report configurations and future-ready schedule table.
-- Run after 059_workflow_type_fine_deduction.sql
-- SAFE: new tables only.

CREATE TABLE IF NOT EXISTS saved_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  report_key  TEXT        NOT NULL,
  filters     JSONB       NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_user
  ON saved_reports(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_shared
  ON saved_reports(tenant_id, is_shared)
  WHERE is_shared = TRUE;

-- Future-ready: scheduled report delivery
CREATE TABLE IF NOT EXISTS report_schedules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  saved_report_id UUID        NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
  cron_expr       TEXT        NOT NULL,
  format          TEXT        NOT NULL DEFAULT 'xlsx'
    CHECK (format IN ('xlsx', 'csv', 'pdf')),
  recipients      JSONB       NOT NULL DEFAULT '[]',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant
  ON report_schedules(tenant_id, is_active)
  WHERE is_active = TRUE;
