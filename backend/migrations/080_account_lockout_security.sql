-- 080_account_lockout_security.sql
-- Account Lockout & Reactivation Security System.
-- Extends the existing failed_login_count / locked_until fields on `users`
-- with a permanent, admin-managed lockout (is_locked) plus IP/device
-- tracking and a configurable per-tenant threshold.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_locked_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lockout_reason VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failed_login_ip VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_failed_login_device TEXT,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by UUID REFERENCES users(id);

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS max_failed_login_attempts INT NOT NULL DEFAULT 5
    CHECK (max_failed_login_attempts BETWEEN 3 AND 10);

CREATE INDEX IF NOT EXISTS idx_users_is_locked ON users(is_locked) WHERE is_locked = TRUE;

-- Persistent per-attempt tracking for IP/device history and security
-- dashboard metrics (failed login trends, suspicious activity, etc.)
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(50),
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_tenant ON login_attempts(tenant_id, created_at DESC);
