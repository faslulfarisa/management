-- 079_user_hierarchy_types.sql
-- Introduce user_type (hierarchy + scope) on user_tenants, separate from
-- the existing roles/positions permission-customization system.

-- 1. Add user_type column (super_admin is NOT stored here; it remains users.is_super_admin)
ALTER TABLE user_tenants
  ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'employee'
  CHECK (user_type IN ('tenant_admin', 'org_admin', 'branch_admin', 'admin', 'employee'));

-- 2. Backfill: existing org admins become 'org_admin'
UPDATE user_tenants
SET user_type = 'org_admin'
WHERE is_org_admin = true;

-- 3. Backfill: users with active branch_user_access role='branch_admin' and still 'employee'
--    become 'admin' (exactly 1 active branch) or 'branch_admin' (2+ active branches)
WITH branch_admin_counts AS (
  SELECT bua.tenant_id, bua.user_id, COUNT(*) AS branch_count
  FROM branch_user_access bua
  WHERE bua.role = 'branch_admin' AND bua.is_active = TRUE
  GROUP BY bua.tenant_id, bua.user_id
)
UPDATE user_tenants ut
SET user_type = CASE WHEN bac.branch_count >= 2 THEN 'branch_admin' ELSE 'admin' END
FROM branch_admin_counts bac
WHERE ut.tenant_id = bac.tenant_id
  AND ut.user_id = bac.user_id
  AND ut.user_type = 'employee';

-- 4. Index for hierarchy lookups
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_type ON user_tenants(tenant_id, user_type);
