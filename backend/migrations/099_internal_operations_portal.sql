-- 099_internal_operations_portal.sql
-- Internal Operations Portal: platform staff (Marketing/Sales/Technical) who
-- manage customer organizations across the whole platform, isolated from the
-- customer-side HRMS user hierarchy. See: modules/operations,
-- shared/internal-roles.constants.ts, shared/ops-permissions.constants.ts.

-- 1. Internal staff flag + role. Modeled exactly like `users.is_super_admin`
--    (global, not org-scoped) since internal staff never belong to a tenant —
--    every existing tenant-scoped controller already 400s them out via
--    ActiveOrgGuard, with no further change needed.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_internal_staff BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_role VARCHAR(32)
    CHECK (internal_role IN (
      'marketing_executive', 'marketing_manager',
      'sales_executive', 'sales_manager',
      'technical_executive', 'technical_manager'
    ));

CREATE INDEX IF NOT EXISTS idx_users_is_internal_staff ON users(is_internal_staff) WHERE is_internal_staff = true;

-- 2. Organization lifecycle pipeline (the organization-management stage
--    Marketing/Sales/Technical track), separate from `tenants.status`
--    (technical login gate: pending/active/suspended) and
--    `tenants.approval_status` (self-registration approval workflow,
--    untouched by this migration). See migration 101 for the stage rework
--    that replaced the original CRM-flavored stage names below.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (lifecycle_stage IN (
      'pending_review', 'pending_approval',
      'onboarding', 'active', 'suspended', 'archived'
    ));

-- Best-effort backfill for existing rows: there's no real history for them,
-- so this is a coarse mapping, not a reconstruction of actual history.
UPDATE tenants SET lifecycle_stage = 'suspended' WHERE status = 'suspended';
UPDATE tenants SET lifecycle_stage = 'onboarding'
  WHERE approval_status IN ('pending_review', 'under_discussion', 'needs_clarification');

CREATE INDEX IF NOT EXISTS idx_tenants_lifecycle_stage ON tenants(lifecycle_stage) WHERE deleted_at IS NULL;
