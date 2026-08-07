-- 166_enterprise_payroll_hardening.sql
-- Additive enterprise hardening for deterministic, branch-aware payroll.

ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_tenant_id_month_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_period_org
  ON payroll_runs(tenant_id, month, year)
  WHERE branch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_branch_period
  ON payroll_runs(tenant_id, branch_id, month, year)
  WHERE branch_id IS NOT NULL;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS lock_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_error TEXT,
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS formula_version TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_generation_status_check;
ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_generation_status_check
  CHECK (generation_status IN ('queued', 'running', 'completed', 'failed', 'cancelled'));

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS salary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS formula_version TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS attendance_version INT,
  ADD COLUMN IF NOT EXISTS salary_version TEXT,
  ADD COLUMN IF NOT EXISTS overtime_version TEXT,
  ADD COLUMN IF NOT EXISTS leave_version TEXT,
  ADD COLUMN IF NOT EXISTS currency_version TEXT,
  ADD COLUMN IF NOT EXISTS overtime_policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS overtime_multiplier NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS overtime_formula TEXT,
  ADD COLUMN IF NOT EXISTS overtime_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payroll_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_payslips_payroll_hash
  ON payslips(tenant_id, payroll_hash)
  WHERE payroll_hash IS NOT NULL;

ALTER TABLE payroll_attendance_summary
  ADD COLUMN IF NOT EXISTS overtime_policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS overtime_multiplier NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS overtime_formula TEXT,
  ADD COLUMN IF NOT EXISTS overtime_approved_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payroll_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  payslip_id UUID REFERENCES payslips(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_state TEXT,
  new_state TEXT,
  reason TEXT,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_tenant_run
  ON payroll_audit_events(tenant_id, payroll_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_employee
  ON payroll_audit_events(tenant_id, employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payroll_reconciliation_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
  payslip_id UUID REFERENCES payslips(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payroll_payments(id) ON DELETE SET NULL,
  expected_net DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_amount DECIMAL(14,2),
  bank_transfer_amount DECIMAL(14,2),
  status TEXT NOT NULL DEFAULT 'pending',
  mismatch_reason TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_reconciliation_payslip
  ON payroll_reconciliation_checks(payslip_id);

CREATE TABLE IF NOT EXISTS payroll_deduction_proration_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  deduction_code TEXT NOT NULL CHECK (deduction_code IN ('pf', 'esi', 'professional_tax', 'tds')),
  mode TEXT NOT NULL DEFAULT 'full' CHECK (mode IN ('full', 'prorated', 'rule_based')),
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payroll_deduction_proration_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_deduction_proration_policy
  ON payroll_deduction_proration_policies(tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), deduction_code, effective_from);
