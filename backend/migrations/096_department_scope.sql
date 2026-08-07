-- Department scope management: a department is now scoped at one of three
-- levels instead of always belonging to a single branch.
--   ORGANIZATION      -> visible to every branch, including future ones
--   SELECTED_BRANCHES -> visible to the branches mapped in department_branches
--   SINGLE_BRANCH     -> visible only to departments.branch_id (today's behavior)
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'SINGLE_BRANCH',
  ADD COLUMN IF NOT EXISTS is_global_department BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE departments
  ADD CONSTRAINT departments_scope_type_check
  CHECK (scope_type IN ('ORGANIZATION', 'SELECTED_BRANCHES', 'SINGLE_BRANCH'));

CREATE INDEX IF NOT EXISTS idx_departments_scope_type ON departments(scope_type);

-- head_employee_id has existed since 001_initial_schema.sql but was never
-- constrained (employees table is defined later in that same file) and is
-- not written anywhere yet, so it's safe to add the FK now that it's used.
ALTER TABLE departments
  ADD CONSTRAINT departments_head_employee_id_fkey
  FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- Maps SELECTED_BRANCHES departments to the branches they're available in.
CREATE TABLE IF NOT EXISTS department_branches (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  branch_id     UUID        NOT NULL REFERENCES branches(id)    ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_department_branches_dept   ON department_branches(department_id);
CREATE INDEX IF NOT EXISTS idx_department_branches_branch ON department_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_department_branches_tenant ON department_branches(tenant_id);
