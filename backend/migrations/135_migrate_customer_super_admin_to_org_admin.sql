-- 135_migrate_customer_super_admin_to_org_admin.sql
-- Backward-compatible cleanup after Platform Portal separation.
--
-- Customer HRMS no longer has a client-side `super_admin` user type. Existing
-- customer users that still carry legacy super-admin authority are converted
-- to organization-scoped `org_admin` memberships. Platform Portal users are
-- deliberately excluded: internal-staff accounts and the `__platform__` system
-- tenant are not modified.

-- Some production databases may still have a pre-separation CHECK constraint
-- that allowed `super_admin` in user_tenants.user_type. Drop any user_type
-- CHECK first so the data can be normalized before the final constraint is
-- restored.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'user_tenants'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%user_type%'
  LOOP
    EXECUTE format('ALTER TABLE user_tenants DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- If a legacy customer super-admin user is still anchored only through
-- users.tenant_id, create/preserve their customer membership as org_admin.
WITH upserted AS (
  INSERT INTO user_tenants (user_id, tenant_id, user_type, is_org_admin)
  SELECT u.id, u.tenant_id, 'org_admin', TRUE
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.is_super_admin = TRUE
    AND COALESCE(u.is_internal_staff, FALSE) = FALSE
    AND u.deleted_at IS NULL
    AND t.deleted_at IS NULL
    AND COALESCE(t.slug, '') <> '__platform__'
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET user_type = 'org_admin',
        is_org_admin = TRUE
    WHERE user_tenants.user_type IS DISTINCT FROM 'org_admin'
       OR user_tenants.is_org_admin IS DISTINCT FROM TRUE
  RETURNING tenant_id, user_id
)
INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, old_values, new_values)
SELECT
  tenant_id,
  NULL,
  'user_access',
  user_id,
  'legacy_super_admin_migrated_to_org_admin',
  jsonb_build_object('userType', 'super_admin'),
  jsonb_build_object('userType', 'org_admin', 'source', 'migration_135')
FROM upserted;

-- Convert all existing customer memberships that either explicitly stored the
-- retired user_type or belong to a legacy customer users.is_super_admin user.
WITH changed AS (
  UPDATE user_tenants ut
  SET user_type = 'org_admin',
      is_org_admin = TRUE
  FROM users u, tenants t
  WHERE ut.user_id = u.id
    AND t.id = ut.tenant_id
    AND COALESCE(u.is_internal_staff, FALSE) = FALSE
    AND u.deleted_at IS NULL
    AND t.deleted_at IS NULL
    AND COALESCE(t.slug, '') <> '__platform__'
    AND (ut.user_type = 'super_admin' OR u.is_super_admin = TRUE)
    AND (ut.user_type IS DISTINCT FROM 'org_admin' OR ut.is_org_admin IS DISTINCT FROM TRUE)
  RETURNING ut.tenant_id, ut.user_id
)
INSERT INTO audit_logs (tenant_id, user_id, entity_type, entity_id, action, old_values, new_values)
SELECT
  tenant_id,
  NULL,
  'user_access',
  user_id,
  'legacy_super_admin_migrated_to_org_admin',
  jsonb_build_object('userType', 'super_admin'),
  jsonb_build_object('userType', 'org_admin', 'source', 'migration_135')
FROM changed;

-- Customer HRMS users should no longer derive a client-side super_admin role
-- from users.is_super_admin. Internal/platform users are excluded.
UPDATE users u
SET is_super_admin = FALSE,
    updated_at = now()
WHERE u.is_super_admin = TRUE
  AND COALESCE(u.is_internal_staff, FALSE) = FALSE
  AND u.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM user_tenants ut
    JOIN tenants t ON t.id = ut.tenant_id
    WHERE ut.user_id = u.id
      AND ut.user_type = 'org_admin'
      AND t.deleted_at IS NULL
      AND COALESCE(t.slug, '') <> '__platform__'
  );

-- Preserve existing explicit Organization Admin assignments. For organizations
-- that had no pointer yet, point at the earliest migrated/current org_admin.
UPDATE tenants t
SET organization_admin_user_id = pick.user_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (ut.tenant_id) ut.tenant_id, ut.user_id
  FROM user_tenants ut
  JOIN users u ON u.id = ut.user_id
  JOIN tenants tenant_row ON tenant_row.id = ut.tenant_id
  WHERE ut.user_type = 'org_admin'
    AND ut.is_org_admin = TRUE
    AND COALESCE(u.is_internal_staff, FALSE) = FALSE
    AND u.deleted_at IS NULL
    AND tenant_row.deleted_at IS NULL
    AND COALESCE(tenant_row.slug, '') <> '__platform__'
  ORDER BY ut.tenant_id, ut.created_at ASC
) pick
WHERE t.id = pick.tenant_id
  AND t.organization_admin_user_id IS NULL;

ALTER TABLE user_tenants
  ADD CONSTRAINT user_tenants_user_type_check
  CHECK (user_type IN ('org_admin', 'branch_admin', 'admin', 'employee'));

-- Verification queries for rollout:
--   SELECT COUNT(*) FROM user_tenants WHERE user_type = 'super_admin';
--   SELECT COUNT(*) FROM users u
--     WHERE u.is_super_admin = TRUE
--       AND COALESCE(u.is_internal_staff, FALSE) = FALSE
--       AND EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = u.id);
