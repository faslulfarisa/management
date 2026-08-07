-- Organization Feature Management
-- Adds organization-specific module/feature overrides and reusable templates
-- on top of the SaaS registry and subscription entitlement tables.

CREATE TABLE IF NOT EXISTS organization_feature_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('module', 'feature')),
  entity_id UUID NOT NULL,
  state VARCHAR(20) NOT NULL CHECK (state IN ('enabled', 'disabled', 'inherit')),
  reason TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_org_feature_overrides_tenant
  ON organization_feature_overrides(tenant_id);

CREATE INDEX IF NOT EXISTS idx_org_feature_overrides_entity
  ON organization_feature_overrides(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS organization_feature_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_feature_template_items (
  template_id UUID NOT NULL REFERENCES organization_feature_templates(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('module', 'feature')),
  entity_id UUID NOT NULL,
  state VARCHAR(20) NOT NULL CHECK (state IN ('enabled', 'disabled', 'inherit')),
  PRIMARY KEY (template_id, entity_type, entity_id)
);

INSERT INTO organization_feature_templates (name, slug, description)
VALUES
  ('Hotel Client', 'hotel-client', 'Recommended modules and features for hotels and hospitality clients.'),
  ('Manufacturing Client', 'manufacturing-client', 'Recommended setup for manufacturing and shift-heavy organizations.'),
  ('Healthcare Client', 'healthcare-client', 'Recommended setup for healthcare workforce operations.'),
  ('Education Client', 'education-client', 'Recommended setup for schools, colleges, and training institutions.'),
  ('Retail Client', 'retail-client', 'Recommended setup for retail and multi-location operations.'),
  ('Startup Client', 'startup-client', 'Lean setup for early-stage organizations.')
ON CONFLICT (slug) DO NOTHING;
