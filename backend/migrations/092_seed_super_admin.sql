-- 092_seed_super_admin.sql
-- Seed a default Super Admin platform account.
--
-- Account:  testadmin@gmail.com / Admin@123
-- Strategy:
--   1. Upsert a "__platform__" system tenant that the user row is anchored to
--      (users.tenant_id is NOT NULL, so a dummy owner is required).
--      The platform tenant is never exposed to normal org-level flows.
--   2. Insert the super-admin user only when the email does not yet exist
--      (idempotent: ON CONFLICT DO NOTHING on the email unique index).
--   3. is_super_admin = TRUE grants platform-wide access; no user_tenants
--      row is required for login (auth.service.ts validates user globally
--      and the login() method handles zero-tenant super-admin users).
--
-- Rollback / DOWN:
--   DELETE FROM users WHERE email = 'testadmin@gmail.com' AND deleted_at IS NULL;
--   -- The __platform__ tenant is intentionally left in place because
--   -- other platform objects may reference it in future migrations.

-- ──────────────────────────────────────────────────────────────────
-- 1. Platform system tenant (owner anchor for the super-admin user row)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO tenants (name, slug, status, timezone, fiscal_year_start)
VALUES (
  'Platform (System)',
  '__platform__',
  'active',
  'Asia/Kolkata',
  4
)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 2. Super Admin user
--    Password: Admin@123  →  bcrypt (cost 12) hash embedded below.
--    Re-running this migration is safe: the INSERT is a no-op when
--    the email already exists (partial unique index on email WHERE
--    deleted_at IS NULL, enforced by migration 016).
-- ──────────────────────────────────────────────────────────────────
INSERT INTO users (
  tenant_id,
  email,
  password_hash,
  is_active,
  is_super_admin,
  status,
  is_locked,
  failed_login_count,
  mfa_enabled
)
SELECT
  t.id,
  'testadmin@gmail.com',
  '$2b$12$Uhx93qdfXEpp1813E2.Bre7EJ1GaF5h6ox8bh5eonJ2ySRCt4jH6K',  -- bcrypt(Admin@123, 12)
  TRUE,    -- is_active
  TRUE,    -- is_super_admin
  'active',-- status  (migration 081 CHECK: active | inactive | locked | …)
  FALSE,   -- is_locked  (migration 080)
  0,       -- failed_login_count
  FALSE    -- mfa_enabled
FROM tenants t
WHERE t.slug = '__platform__'
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'testadmin@gmail.com' AND deleted_at IS NULL
  );
