-- 044_departments_branch_id.sql
-- Adds branch_id to departments alongside the existing property_id column.
-- Backfills via property_id → branches.property_id lookup.
-- Run after 043_backfill_branches_from_properties.sql
-- SAFE: additive ALTER + UPDATE backfill — no existing columns or rows removed.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Backfill: map departments to the branch that was seeded from their property
UPDATE departments d
SET    branch_id = b.id
FROM   branches b
WHERE  b.property_id = d.property_id
  AND  d.branch_id IS NULL
  AND  d.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_departments_branch
  ON departments(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_tenant_branch
  ON departments(tenant_id, branch_id)
  WHERE deleted_at IS NULL;
