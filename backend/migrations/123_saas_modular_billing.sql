-- 123_saas_modular_billing.sql
-- Transition from monolithic subscription plans to a fully modular SaaS billing architecture.

-- 1. Base Plans
CREATE TABLE IF NOT EXISTS saas_base_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Modules
CREATE TABLE IF NOT EXISTS saas_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(12,2) NOT NULL DEFAULT 0,
  setup_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_standalone_allowed BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Features
CREATE TABLE IF NOT EXISTS saas_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES saas_modules(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Resources
CREATE TABLE IF NOT EXISTS saas_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  unit_name VARCHAR(50) NOT NULL,
  price_per_unit_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_per_unit_yearly DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Add-ons
CREATE TABLE IF NOT EXISTS saas_add_ons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Discounts (Promotional / Custom)
CREATE TABLE IF NOT EXISTS saas_discounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(100) UNIQUE,
  name VARCHAR(150),
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  amount DECIMAL(12,2) NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  usage_limit INT,
  times_used INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Base Plan Configurations
CREATE TABLE IF NOT EXISTS saas_plan_modules (
  plan_id UUID NOT NULL REFERENCES saas_base_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES saas_modules(id) ON DELETE CASCADE,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (plan_id, module_id)
);

CREATE TABLE IF NOT EXISTS saas_plan_features (
  plan_id UUID NOT NULL REFERENCES saas_base_plans(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES saas_features(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, feature_id)
);

CREATE TABLE IF NOT EXISTS saas_plan_resources (
  plan_id UUID NOT NULL REFERENCES saas_base_plans(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES saas_resources(id) ON DELETE CASCADE,
  included_quantity INT, -- 0 means pay for all, NULL means unlimited
  max_allowed INT, -- NULL means unlimited
  PRIMARY KEY (plan_id, resource_id)
);

-- 8. Migrate Data from subscription_plans to saas_base_plans
INSERT INTO saas_base_plans (id, name, slug, price_monthly, price_yearly, is_active, created_at)
SELECT id, name, slug, price_monthly, price_yearly, is_active, created_at
FROM subscription_plans;

-- Seed default resource limits for backward compatibility
INSERT INTO saas_resources (name, slug, description, unit_name) VALUES 
  ('Active Branches', 'branches', 'Operational branches/locations', 'Branch'),
  ('Active Employees', 'employees', 'Total active employees', 'Employee');

-- We map old max_users and max_properties (if any were set) to the new saas_plan_resources
INSERT INTO saas_plan_resources (plan_id, resource_id, included_quantity)
SELECT 
  p.id, 
  r.id,
  p.max_active_branches
FROM subscription_plans p
JOIN saas_resources r ON r.slug = 'branches'
WHERE p.max_active_branches IS NOT NULL;

INSERT INTO saas_plan_resources (plan_id, resource_id, included_quantity)
SELECT 
  p.id, 
  r.id,
  p.max_users
FROM subscription_plans p
JOIN saas_resources r ON r.slug = 'employees'
WHERE p.max_users IS NOT NULL AND p.max_users > 0;

-- 9. Update tenant_subscriptions to map to saas_base_plans instead of subscription_plans
ALTER TABLE tenant_subscriptions DROP CONSTRAINT IF EXISTS tenant_subscriptions_plan_id_fkey;
ALTER TABLE tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES saas_base_plans(id);

ALTER TABLE tenant_subscriptions 
  ADD COLUMN IF NOT EXISTS base_price DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS is_custom_pricing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_pricing_notes TEXT;

-- Backfill base_price
UPDATE tenant_subscriptions ts
SET base_price = ts.amount;

-- 10. Tenant Subscribed Items
CREATE TABLE IF NOT EXISTS tenant_subscription_modules (
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES saas_modules(id),
  price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (subscription_id, module_id)
);

CREATE TABLE IF NOT EXISTS tenant_subscription_features (
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES saas_features(id),
  price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (subscription_id, feature_id)
);

CREATE TABLE IF NOT EXISTS tenant_subscription_resources (
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES saas_resources(id),
  allocated_quantity INT,
  unit_price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (subscription_id, resource_id)
);

CREATE TABLE IF NOT EXISTS tenant_subscription_add_ons (
  subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  add_on_id UUID NOT NULL REFERENCES saas_add_ons(id),
  price DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (subscription_id, add_on_id)
);

-- 11. Enterprise Quotes
CREATE TABLE IF NOT EXISTS tenant_enterprise_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'converted')),
  total_amount DECIMAL(12,2) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
