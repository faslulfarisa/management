-- Migration 047: Add branch_id to finance and payroll tables
-- Phase 3 of Branch module integration

-- ── expenses ──────────────────────────────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE expenses ex
SET    branch_id = e.branch_id
FROM   employees e
WHERE  e.id = ex.employee_id
  AND  ex.branch_id IS NULL
  AND  e.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_branch        ON expenses(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch ON expenses(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── reimbursements ────────────────────────────────────────────────────────────
ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE reimbursements r
SET    branch_id = e.branch_id
FROM   employees e
WHERE  e.id = r.employee_id
  AND  r.branch_id IS NULL
  AND  e.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reimbursements_branch        ON reimbursements(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reimbursements_tenant_branch ON reimbursements(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── invoices ──────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_branch        ON invoices(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_branch ON invoices(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── vendor_bills ──────────────────────────────────────────────────────────────
ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_bills_branch        ON vendor_bills(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_bills_tenant_branch ON vendor_bills(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── cashbook_entries ──────────────────────────────────────────────────────────
ALTER TABLE cashbook_entries
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_branch        ON cashbook_entries(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_tenant_branch ON cashbook_entries(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── budgets ───────────────────────────────────────────────────────────────────
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_branch        ON budgets(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_tenant_branch ON budgets(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── cost_centers ──────────────────────────────────────────────────────────────
ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE cost_centers cc
SET    branch_id = b.id
FROM   branches b
WHERE  b.property_id = cc.property_id
  AND  cc.branch_id IS NULL
  AND  cc.property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cost_centers_branch        ON cost_centers(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant_branch ON cost_centers(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── payroll_runs ──────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch        ON payroll_runs(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_branch ON payroll_runs(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── payslips ──────────────────────────────────────────────────────────────────
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

UPDATE payslips p
SET    branch_id = e.branch_id
FROM   employees e
WHERE  e.id = p.employee_id
  AND  p.branch_id IS NULL
  AND  e.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payslips_branch        ON payslips(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_branch ON payslips(tenant_id, branch_id) WHERE branch_id IS NOT NULL;

-- ── finance_payments ──────────────────────────────────────────────────────────
ALTER TABLE finance_payments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_payments_branch        ON finance_payments(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_payments_tenant_branch ON finance_payments(tenant_id, branch_id) WHERE branch_id IS NOT NULL;
