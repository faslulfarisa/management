-- 076_areas_branch_id.sql
-- Adds branch_id to areas table so physical zones can be scoped to a branch.
-- Existing areas are left with branch_id = NULL; they can be assigned via the admin UI.
-- Run after 075_branding_two_logo_types.sql
-- SAFE: additive ALTER only — no existing columns or rows removed.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_areas_branch
  ON areas(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_areas_department
  ON areas(department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_areas_tenant_branch
  ON areas(tenant_id, branch_id)
  WHERE deleted_at IS NULL;
