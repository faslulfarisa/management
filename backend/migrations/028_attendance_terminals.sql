-- 028_attendance_terminals.sql
-- Trusted device registry for software attendance terminals:
-- laptops, tablets, kiosks, mobile devices used for clock-in/out.
-- Run after 027_biometric_devices.sql
-- SAFE: New table — no existing data touched.

CREATE TABLE IF NOT EXISTS attendance_terminals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- branch_id is a plain UUID reference (no branches table in this schema)
  branch_id       UUID,

  -- Identity
  device_name     TEXT        NOT NULL,
  device_type     TEXT        NOT NULL
    CHECK (device_type IN ('laptop', 'tablet', 'mobile', 'kiosk')),

  -- Auth: SHA-256(terminal_token) — raw token shown once at registration
  token_hash      TEXT        NOT NULL UNIQUE,

  -- Network security: CIDR or exact IPs permitted for this terminal.
  -- Empty array = no IP restriction enforced.
  allowed_ips     JSONB       NOT NULL DEFAULT '[]',

  -- Lifecycle
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  is_online       BOOLEAN     NOT NULL DEFAULT false,
  last_ping_at    TIMESTAMPTZ,
  last_punch_at   TIMESTAMPTZ,

  -- Registration
  registered_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ,           -- NULL = token never expires

  metadata        JSONB       NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminals_tenant_active
  ON attendance_terminals (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_terminals_branch
  ON attendance_terminals (branch_id)
  WHERE branch_id IS NOT NULL;

-- token_hash lookup is the hot path on every terminal punch request
CREATE INDEX IF NOT EXISTS idx_terminals_token_hash
  ON attendance_terminals (token_hash);
