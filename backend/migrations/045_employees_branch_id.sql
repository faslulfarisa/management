-- 045_employees_branch_id.sql
-- Adds branch_id directly to employees for first-class branch membership.
-- Backfill priority:
--   1. Derive from employee's department (department.branch_id)
--   2. Fall back to employee's own property_id → branch link
-- Run after 044_departments_branch_id.sql
-- SAFE: additive ALTER + UPDATE backfill — no existing columns or rows removed.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Pass 1: derive branch from department
UPDATE employees e
SET    branch_id = d.branch_id
FROM   departments d
WHERE  d.id = e.department_id
  AND  d.branch_id IS NOT NULL
  AND  e.branch_id IS NULL
  AND  e.deleted_at IS NULL;

-- Pass 2: fall back to employee's own property_id
UPDATE employees e
SET    branch_id = b.id
FROM   branches b
WHERE  b.property_id = e.property_id
  AND  e.branch_id IS NULL
  AND  e.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_branch
  ON employees(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_tenant_branch
  ON employees(tenant_id, branch_id)
  WHERE deleted_at IS NULL;
