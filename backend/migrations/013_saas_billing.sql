-- 013_saas_billing.sql
-- SaaS Billing & Subscription Module

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2) NOT NULL,
  max_users INT DEFAULT 0,
  max_properties INT DEFAULT 0,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(slug)
);
CREATE INDEX IF NOT EXISTS idx_sp_active ON subscription_plans(is_active);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT DEFAULT 'active',
  billing_cycle TEXT DEFAULT 'monthly',
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  auto_renew BOOLEAN DEFAULT true,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ts_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ts_status ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_ts_next_billing ON tenant_subscriptions(next_billing_date);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  invoice_number TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_si_tenant ON subscription_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_si_status ON subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_si_due ON subscription_invoices(due_date);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  invoice_id UUID REFERENCES subscription_invoices(id),
  amount DECIMAL(10,2) NOT NULL,
  gateway TEXT NOT NULL,
  gateway_transaction_id TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pt_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pt_invoice ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pt_status ON payment_transactions(status);
