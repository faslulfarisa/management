-- 091_notification_center.sql
-- Notification Center & Workflow Hub: extends the existing `notifications`
-- table (from 010_automation.sql) with classification, scoping, and
-- lifecycle columns needed for a filterable, actionable inbox. Also adds
-- per-user/per-module notification channel preferences.
-- SAFE: additive only (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS source_module TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_not_branch ON notifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_not_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_not_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_not_source ON notifications(source_module);
CREATE INDEX IF NOT EXISTS idx_not_tenant_created ON notifications(tenant_id, created_at DESC);

-- Per-user, per-module notification channel preferences.
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT true,
  email BOOLEAN NOT NULL DEFAULT false,
  sms BOOLEAN NOT NULL DEFAULT false,
  whatsapp BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(tenant_id, user_id);
