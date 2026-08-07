-- 138_operations_subscription_management.sql
-- Operations subscription workspace: catalog and one-off custom subscription
-- assignment, source reporting, staff attribution, and signup-offer linkage.

ALTER TABLE tenant_subscriptions
  ALTER COLUMN plan_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS subscription_source VARCHAR(32) NOT NULL DEFAULT 'catalog'
    CHECK (subscription_source IN ('catalog', 'custom', 'signup_offer', 'free_trial', 'free_plan', 'manual')),
  ADD COLUMN IF NOT EXISTS custom_plan_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signup_offer_redemption_id UUID REFERENCES tenant_signup_offer_redemptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_source
  ON tenant_subscriptions(subscription_source);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_status_created
  ON tenant_subscriptions(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_period_end
  ON tenant_subscriptions(current_period_end);
