-- 077_soft_delete_unique_code_indexes.sql
-- Replace blanket UNIQUE(tenant_id, code) table-level constraints with
-- soft-delete-aware partial unique indexes.
--
-- Problem: deleted/archived records retained their codes, blocking reuse.
--   • Tables with deleted_at: code is reserved forever even after soft-delete.
--   • Tables with is_active: deactivated records block re-creation.
--
-- Fix: partial unique indexes enforce uniqueness only among LIVE records,
-- so a code becomes reusable once the record is soft-deleted or deactivated.
--
-- Tenant isolation is preserved: all indexes remain scoped to (tenant_id, code).
-- SAFE: DROP CONSTRAINT IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS —
--       no data is touched, existing live records are unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES WITH deleted_at (soft-delete)
-- Partial index filters: WHERE deleted_at IS NULL
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PROPERTIES
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_tenant_code_active
  ON properties(tenant_id, code)
  WHERE deleted_at IS NULL;

-- 2. COST CENTERS
ALTER TABLE cost_centers
  DROP CONSTRAINT IF EXISTS cost_centers_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_centers_tenant_code_active
  ON cost_centers(tenant_id, code)
  WHERE deleted_at IS NULL;

-- 3. ROLES  (unique on name, not code)
ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_tenant_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_tenant_name_active
  ON roles(tenant_id, name)
  WHERE deleted_at IS NULL;

-- 4. AREAS  (code is nullable — guard with code IS NOT NULL)
ALTER TABLE areas
  DROP CONSTRAINT IF EXISTS areas_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_areas_tenant_code_active
  ON areas(tenant_id, code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- 5. POSITIONS  (code is nullable)
ALTER TABLE positions
  DROP CONSTRAINT IF EXISTS positions_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_tenant_code_active
  ON positions(tenant_id, code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- 6. BRANCHES
ALTER TABLE branches
  DROP CONSTRAINT IF EXISTS branches_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_code_active
  ON branches(tenant_id, code)
  WHERE deleted_at IS NULL;

-- 7. EMPLOYEES  (field is employee_code, not code)
ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_tenant_id_employee_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_tenant_empcode_active
  ON employees(tenant_id, employee_code)
  WHERE deleted_at IS NULL;

-- 8. DEPARTMENTS  (previously unconstrained — add going forward)
--    Only constrains non-null codes on active records so existing data is safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_tenant_code_active
  ON departments(tenant_id, code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES WITH is_active (logical soft-delete via flag)
-- Partial index filters: WHERE is_active = true
-- ─────────────────────────────────────────────────────────────────────────────

-- 9. SHIFT DEFINITIONS
ALTER TABLE shift_definitions
  DROP CONSTRAINT IF EXISTS shift_definitions_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_definitions_tenant_code_active
  ON shift_definitions(tenant_id, code)
  WHERE is_active = true;

-- 10. LEAVE TYPES
ALTER TABLE leave_types
  DROP CONSTRAINT IF EXISTS leave_types_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_types_tenant_code_active
  ON leave_types(tenant_id, code)
  WHERE is_active = true;

-- 11. CHART OF ACCOUNTS
ALTER TABLE chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_tenant_id_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chart_of_accounts_tenant_code_active
  ON chart_of_accounts(tenant_id, code)
  WHERE is_active = true;

-- NOTE: deduction_categories is intentionally excluded.
-- Its service layer uses ON CONFLICT (tenant_id, code) DO UPDATE / DO NOTHING
-- for idempotent seeding — preserving the original full constraint avoids
-- breaking those upsert clauses and matches the expected UPSERT semantics.
