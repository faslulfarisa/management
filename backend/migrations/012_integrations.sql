-- 012_integrations.sql
-- Integrations Module: Third-party API connections, webhooks, sync logs

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_int_tenant ON integrations(tenant_id);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_tenant ON webhooks(tenant_id);

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  integration_id UUID REFERENCES integrations(id),
  direction TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  records_synced INT DEFAULT 0,
  status TEXT DEFAULT 'success',
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sl_tenant ON sync_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sl_integration ON sync_logs(integration_id);
