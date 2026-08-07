-- 104_bulk_import_credentials.sql
-- Supports intelligent username/password generation for Bulk User Import:
--   * `username` is a tenant-scoped, optional display/credential field (login
--     itself stays email-based — see users.email unique index already in
--     001_initial_schema.sql — this just gives HR a stable, generated handle
--     to hand out alongside the temporary password).
--   * `must_change_password` flags accounts (bulk-imported or otherwise) that
--     must rotate their password before reaching the dashboard.
--   * `password_change_sessions` mirrors the mfa_login_sessions pattern from
--     103_mfa_login_enforcement.sql: the password step lands here instead of
--     issuing a JWT directly when must_change_password=true.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username
  ON users (tenant_id, LOWER(username))
  WHERE username IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS password_change_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(64),
  user_agent TEXT,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_change_sessions_expires ON password_change_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_change_sessions_user ON password_change_sessions(user_id);
