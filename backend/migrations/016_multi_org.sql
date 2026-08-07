-- 016_multi_org.sql
-- Multi-Organization Support: users can belong to multiple tenants

-- 1. Add is_super_admin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. Create user_tenants join table
DROP TABLE IF EXISTS user_tenants CASCADE;
CREATE TABLE user_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_org_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- 3. Migrate existing user→tenant associations into user_tenants
INSERT INTO user_tenants (user_id, tenant_id, is_org_admin)
SELECT id, tenant_id, false
FROM users
WHERE tenant_id IS NOT NULL
  AND deleted_at IS NULL
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- 4. Mark existing single-tenant admins (users with Super Admin role) as org admins
UPDATE user_tenants ut
SET is_org_admin = true
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = ut.user_id
  AND ur.tenant_id = ut.tenant_id
  AND r.name = 'Super Admin'
  AND r.is_system = true;

-- 5. Mark existing Super Admin users as super_admin at the user level
UPDATE users u
SET is_super_admin = true
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = u.id
  AND r.name = 'Super Admin'
  AND r.is_system = true;

-- 6. Drop old unique constraint on (tenant_id, email), add global unique on email
-- Note: We keep tenant_id column for backward compat but it will be deprecated
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_email_key;

-- Create unique index on email (only for non-deleted users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
ON users(email) WHERE deleted_at IS NULL;

-- 7. Add organization-management permissions
INSERT INTO permissions (module, action) VALUES
  ('platform.organizations', 'view'),
  ('platform.organizations', 'create'),
  ('platform.organizations', 'edit'),
  ('platform.organizations', 'delete')
ON CONFLICT (module, action) DO NOTHING;

-- 8. Grant org permissions to any existing Super Admin roles
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND r.is_system = true
  AND p.module = 'platform.organizations'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
