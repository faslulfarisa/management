-- 140_operations_subscription_invoices.sql
-- Internal Operations invoice handling metadata for platform subscription invoices.

ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_si_tenant_created
  ON subscription_invoices(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_si_subscription
  ON subscription_invoices(subscription_id);
