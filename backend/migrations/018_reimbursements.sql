-- 018_reimbursements.sql
-- Reimbursement Module: Employee allowance & expense reimbursement claims

CREATE TABLE IF NOT EXISTS reimbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID REFERENCES employees(id),
  claim_number TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  expense_date DATE NOT NULL,
  description TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, claim_number)
);

CREATE INDEX IF NOT EXISTS idx_reimb_tenant ON reimbursements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reimb_employee ON reimbursements(employee_id);
CREATE INDEX IF NOT EXISTS idx_reimb_status ON reimbursements(status);
CREATE INDEX IF NOT EXISTS idx_reimb_category ON reimbursements(category);
CREATE INDEX IF NOT EXISTS idx_reimb_expense_date ON reimbursements(expense_date);
