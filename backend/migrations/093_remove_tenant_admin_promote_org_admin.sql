-- 093_remove_tenant_admin_promote_org_admin.sql
-- Removes the tenant_admin hierarchy tier. Organization Admin becomes the
-- highest business-level role beneath Super Admin (single assigned org).
-- See docs/USER_HIERARCHY_AND_ROLES.md and docs/ROLE_ACCESS_MATRIX.md.

-- 1. Organization ownership mapping: every org now has at most one
--    designated Organization Admin, assigned by a Super Admin.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS organization_admin_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_by_super_admin UUID REFERENCES users(id);

-- 2. Data migration: tenant_admin was multi-org (a user could hold it across
--    several `user_tenants` rows); org_admin is single-org. For each affected
--    user, keep org_admin on their earliest-created membership only; demote
--    every other membership to 'employee'. NOTE: this can leave an
--    organization with no Organization Admin if its only admin was a
--    tenant_admin whose earliest org was elsewhere — see the post-migration
--    review query below.
WITH ranked AS (
  SELECT id, user_id, tenant_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM user_tenants
  WHERE user_type = 'tenant_admin'
)
UPDATE user_tenants ut
SET user_type = 'org_admin', is_org_admin = TRUE
FROM ranked r
WHERE ut.id = r.id AND r.rn = 1;

WITH ranked AS (
  SELECT id, user_id, tenant_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM user_tenants
  WHERE user_type = 'tenant_admin'
)
UPDATE user_tenants ut
SET user_type = 'employee', is_org_admin = FALSE
FROM ranked r
WHERE ut.id = r.id AND r.rn > 1;

-- 3. Backfill organization_admin_user_id from the (now consolidated) single
--    org_admin per tenant, where not already set.
UPDATE tenants t
SET organization_admin_user_id = pick.user_id
FROM (
  SELECT DISTINCT ON (ut.tenant_id) ut.tenant_id, ut.user_id
  FROM user_tenants ut
  WHERE ut.user_type = 'org_admin'
  ORDER BY ut.tenant_id, ut.created_at ASC
) pick
WHERE t.id = pick.tenant_id
  AND t.organization_admin_user_id IS NULL;

-- 4. Tighten the user_type CHECK constraint to drop 'tenant_admin'. The
--    constraint was added inline in 079_user_hierarchy_types.sql so its name
--    is looked up dynamically rather than assumed.
DO $$
DECLARE
  existing_constraint text;
BEGIN
  SELECT con.conname INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'user_tenants'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%user_type%';

  IF existing_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_tenants DROP CONSTRAINT %I', existing_constraint);
  END IF;
END $$;

ALTER TABLE user_tenants
  ADD CONSTRAINT user_tenants_user_type_check
  CHECK (user_type IN ('org_admin', 'branch_admin', 'admin', 'employee'));

-- 5. The seeded 'Tenant Admin' system Role row (a distinct concept from the
--    user_type removed above) is intentionally left in place to avoid
--    cascading deletes of historical role_permissions/user_roles. seed.ts no
--    longer creates or assigns it going forward; any pre-existing row is
--    inert from this point on.

-- Manual rollout step (not automated by this migration): after applying,
-- review organizations left without an Organization Admin and assign one via
-- the existing Edit Access flow:
--   SELECT id, name FROM tenants WHERE deleted_at IS NULL AND organization_admin_user_id IS NULL;
