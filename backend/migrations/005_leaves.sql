-- 005_leaves.sql
-- HR Module 2.10: Leave Management

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  paid BOOLEAN DEFAULT true,
  max_days_per_year INT DEFAULT 0,
  requires_document BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_lt_tenant ON leave_types(tenant_id);

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year INT NOT NULL,
  allocated DECIMAL(5,2) DEFAULT 0,
  used DECIMAL(5,2) DEFAULT 0,
  available DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, leave_type_id, year)
);
CREATE INDEX IF NOT EXISTS idx_lb_tenant ON leave_balances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lb_employee ON leave_balances(employee_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days DECIMAL(5,2) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lr_tenant ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lr_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_lr_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_lr_dates ON leave_requests(start_date, end_date);
