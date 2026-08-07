-- 137_admin_login_entrypoint.sql
-- Supports the dedicated Customer Admin login without changing RBAC or
-- post-authentication permissions.

ALTER TABLE mfa_login_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

ALTER TABLE password_change_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_mfa_login_sessions_tenant
  ON mfa_login_sessions(tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_change_sessions_tenant
  ON password_change_sessions(tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_company_code_unique_active
  ON tenants (LOWER(company_code))
  WHERE company_code IS NOT NULL AND deleted_at IS NULL;
