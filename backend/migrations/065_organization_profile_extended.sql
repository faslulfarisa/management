-- Migration 065: Extend tenants table with full organization profile fields
-- Adds legal, contact, address, and operational configuration columns.
-- All columns are nullable/have defaults for backward compatibility.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS legal_name             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trade_name             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS company_code           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS registration_number    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pan_number             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cin_number             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS company_type           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS primary_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS support_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone_number           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS alternate_phone        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS website_url            VARCHAR(500),
  ADD COLUMN IF NOT EXISTS registered_address     JSONB,
  ADD COLUMN IF NOT EXISTS operational_address    JSONB,
  ADD COLUMN IF NOT EXISTS currency               VARCHAR(10)  DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS date_format            VARCHAR(20)  DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS work_week_config       JSONB,
  ADD COLUMN IF NOT EXISTS leave_year_config      JSONB,
  ADD COLUMN IF NOT EXISTS profile_updated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_updated_by     UUID REFERENCES users(id);

-- Index for profile lookup by primary email
CREATE INDEX IF NOT EXISTS idx_tenants_primary_email
  ON tenants(primary_email) WHERE primary_email IS NOT NULL AND deleted_at IS NULL;

-- Add organization_profile permissions
INSERT INTO permissions (module, action, description)
VALUES
  ('organization_profile', 'view',   'View organization profile and branding'),
  ('organization_profile', 'edit',   'Edit organization profile, branding, and settings')
ON CONFLICT (module, action) DO NOTHING;

-- Grant view + edit to org_admin system role if it exists
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'org_admin'
  AND r.is_system = TRUE
  AND p.module = 'organization_profile'
  AND p.action IN ('view', 'edit')
ON CONFLICT DO NOTHING;
