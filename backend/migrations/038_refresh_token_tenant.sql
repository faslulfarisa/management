-- 038_refresh_token_tenant.sql
-- Store the active tenant_id in refresh_tokens so that token refresh
-- preserves the organization context the user was working in.
-- Without this, refreshing an access token would revert to users.tenant_id
-- (legacy column) and lose context for users who had switched organizations.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
