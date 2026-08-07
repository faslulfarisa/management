-- 010_automation.sql
-- Automation Module: Scheduled tasks, workflows, notifications

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  actions JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_tenant ON automation_rules(tenant_id);

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  rule_id UUID REFERENCES automation_rules(id),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'success',
  details JSONB DEFAULT '{}',
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_al_tenant ON automation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_al_rule ON automation_logs(rule_id);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  task_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_st_tenant ON scheduled_tasks(tenant_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_not_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_not_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_not_read ON notifications(is_read);
