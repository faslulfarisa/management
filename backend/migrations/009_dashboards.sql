-- 009_dashboards.sql
-- Dashboard Module: KPI tracking, widget configurations

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  position INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dw_tenant ON dashboard_widgets(tenant_id);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  metric TEXT NOT NULL,
  value DECIMAL(14,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_kpi_tenant ON kpi_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kpi_metric ON kpi_snapshots(metric);
CREATE INDEX IF NOT EXISTS idx_kpi_recorded ON kpi_snapshots(recorded_at);
