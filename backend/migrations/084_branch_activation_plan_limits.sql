-- 084_branch_activation_plan_limits.sql
-- TEMPORARY subscription-gated branch activation.
--
-- Adds an "is_activated" flag (operational activation under the org's plan)
-- that is independent of the existing "is_active"/"status" soft-delete
-- lifecycle on branches. Also adds "is_default" to mark each tenant's
-- primary branch, and a per-plan "max_active_branches" limit so the
-- enforcement logic can read its limit from subscription_plans instead
-- of a hardcoded constant.
--
-- SAFE: additive columns only — existing branch CRUD, soft-delete,
-- attendance/payroll integrations are untouched.

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS is_activated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default   BOOLEAN NOT NULL DEFAULT false;

-- Grandfather in all currently-active branches so existing tenants keep
-- operating exactly as before — only newly-created branches going forward
-- are subject to the plan's active-branch limit.
UPDATE branches
SET is_activated = true
WHERE is_active = true AND deleted_at IS NULL;

-- Mark each tenant's earliest active branch as its default branch
-- (frictionless onboarding for tenants that already have branches).
WITH first_branch AS (
  SELECT DISTINCT ON (tenant_id) id
  FROM branches
  WHERE is_active = true AND deleted_at IS NULL
  ORDER BY tenant_id, created_at ASC
)
UPDATE branches b
SET is_default = true
FROM first_branch fb
WHERE b.id = fb.id;

CREATE INDEX IF NOT EXISTS idx_branches_activation
  ON branches(tenant_id, is_activated)
  WHERE is_active = true AND deleted_at IS NULL;

-- Per-plan active-branch limit. NULL = unlimited.
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_active_branches INT;

UPDATE subscription_plans SET max_active_branches = 1  WHERE slug ILIKE 'free'         AND max_active_branches IS NULL;
UPDATE subscription_plans SET max_active_branches = 3  WHERE slug ILIKE 'starter'      AND max_active_branches IS NULL;
UPDATE subscription_plans SET max_active_branches = 10 WHERE slug ILIKE 'professional' AND max_active_branches IS NULL;
-- 'enterprise' intentionally left NULL (unlimited).
