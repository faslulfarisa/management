-- 103_mfa_login_enforcement.sql
-- Enforces MFA during login instead of just flagging it. Adds a short-lived
-- login-session table (the password step lands here when mfa_enabled=true,
-- and no JWT is issued until TOTP/recovery-code verification succeeds),
-- per-user MFA brute-force lockout columns (mirrors the existing
-- failed_login_count/locked_until pattern), trusted-device exemptions, and
-- hashed one-time recovery codes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mfa_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mfa_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(64),
  user_agent TEXT,
  verified_at TIMESTAMPTZ,
  failed_attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_login_sessions_expires ON mfa_login_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_mfa_login_sessions_user ON mfa_login_sessions(user_id);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  browser_fingerprint TEXT,
  ip_address VARCHAR(64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id) WHERE used_at IS NULL;
