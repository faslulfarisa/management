-- 006_payroll.sql
-- HR Module 2.11: Payroll & Payslips

CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  basic DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) DEFAULT 0,
  da DECIMAL(12,2) DEFAULT 0,
  conveyance DECIMAL(12,2) DEFAULT 0,
  medical DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  pf_employer DECIMAL(12,2) DEFAULT 0,
  pf_employee DECIMAL(12,2) DEFAULT 0,
  esi_employer DECIMAL(12,2) DEFAULT 0,
  esi_employee DECIMAL(12,2) DEFAULT 0,
  professional_tax DECIMAL(12,2) DEFAULT 0,
  tds DECIMAL(12,2) DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ss_tenant ON salary_structures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ss_employee ON salary_structures(employee_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  status TEXT DEFAULT 'draft',
  total_gross DECIMAL(14,2) DEFAULT 0,
  total_deductions DECIMAL(14,2) DEFAULT 0,
  total_net DECIMAL(14,2) DEFAULT 0,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_pr_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pr_month_year ON payroll_runs(month, year);

CREATE TABLE IF NOT EXISTS payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  month INT NOT NULL,
  year INT NOT NULL,
  basic DECIMAL(12,2) DEFAULT 0,
  hra DECIMAL(12,2) DEFAULT 0,
  da DECIMAL(12,2) DEFAULT 0,
  conveyance DECIMAL(12,2) DEFAULT 0,
  medical DECIMAL(12,2) DEFAULT 0,
  special_allowance DECIMAL(12,2) DEFAULT 0,
  overtime DECIMAL(12,2) DEFAULT 0,
  bonus DECIMAL(12,2) DEFAULT 0,
  gross_salary DECIMAL(12,2) DEFAULT 0,
  pf DECIMAL(12,2) DEFAULT 0,
  esi DECIMAL(12,2) DEFAULT 0,
  professional_tax DECIMAL(12,2) DEFAULT 0,
  tds DECIMAL(12,2) DEFAULT 0,
  other_deductions DECIMAL(12,2) DEFAULT 0,
  total_deductions DECIMAL(12,2) DEFAULT 0,
  net_salary DECIMAL(12,2) DEFAULT 0,
  status TEXT DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, employee_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_ps_tenant ON payslips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ps_employee ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_ps_payroll ON payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_ps_month_year ON payslips(month, year);
