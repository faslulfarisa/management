-- 010_notifications.sql
-- Base notification table used by the notification center and workflow alerts.

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
