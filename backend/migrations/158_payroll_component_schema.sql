-- 158_payroll_component_schema.sql
-- Modern payroll schema foundation.
--
-- Safe and backward-compatible:
-- - Existing salary_structures and payslips columns remain untouched.
-- - Payroll calculations and APIs can continue reading the legacy columns.
-- - New reusable component tables mirror legacy rows and support future
--   unlimited earnings, deductions, reimbursements, taxes, pension, insurance,
--   allowances, and employer-paid components.

-- ---------------------------------------------------------------------------
-- Organization/country payroll context
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL DEFAULT 'IN',
  jurisdiction_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  default_currency TEXT NOT NULL DEFAULT 'INR',
  currency_symbol VARCHAR(12),
  exchange_rate DECIMAL(18,8),
  tax_year_start_month INT NOT NULL DEFAULT 4 CHECK (tax_year_start_month BETWEEN 1 AND 12),
  pay_frequency TEXT NOT NULL DEFAULT 'monthly',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payroll_profiles_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_profiles_one_default
  ON payroll_profiles(tenant_id, country_code)
  WHERE is_default = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_payroll_profiles_tenant_active
  ON payroll_profiles(tenant_id, is_active, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_profiles_country
  ON payroll_profiles(country_code, jurisdiction_code)
  WHERE is_active = true;

ALTER TABLE salary_structures
  ADD COLUMN IF NOT EXISTS payroll_profile_id UUID REFERENCES payroll_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_country_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS payroll_jurisdiction_code TEXT,
  ADD COLUMN IF NOT EXISTS component_schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS components_migrated_at TIMESTAMPTZ;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS payroll_profile_id UUID REFERENCES payroll_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_country_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS payroll_jurisdiction_code TEXT,
  ADD COLUMN IF NOT EXISTS component_schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS component_totals JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS payroll_profile_id UUID REFERENCES payroll_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_country_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS payroll_jurisdiction_code TEXT,
  ADD COLUMN IF NOT EXISTS component_schema_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS component_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS components_migrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_salary_structures_payroll_profile
  ON salary_structures(payroll_profile_id)
  WHERE payroll_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_profile_period
  ON payroll_runs(tenant_id, payroll_profile_id, year DESC, month DESC)
  WHERE payroll_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payslips_profile_period
  ON payslips(tenant_id, payroll_profile_id, year DESC, month DESC)
  WHERE payroll_profile_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reusable component catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_component_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  country_code VARCHAR(2),
  jurisdiction_code TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'earning',
    'deduction',
    'employer_contribution',
    'reimbursement',
    'tax',
    'pension',
    'insurance',
    'allowance',
    'informational'
  )),
  category TEXT,
  description TEXT,
  is_statutory BOOLEAN NOT NULL DEFAULT false,
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  is_proratable BOOLEAN NOT NULL DEFAULT true,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  affects_gross BOOLEAN NOT NULL DEFAULT true,
  affects_net BOOLEAN NOT NULL DEFAULT true,
  payable_to_employee BOOLEAN NOT NULL DEFAULT true,
  employer_paid BOOLEAN NOT NULL DEFAULT false,
  default_currency TEXT,
  calculation_method TEXT NOT NULL DEFAULT 'fixed_amount',
  calculation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  reporting_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payroll_component_effective_range
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_components_global_code
  ON payroll_component_definitions(code)
  WHERE tenant_id IS NULL AND country_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_components_country_code
  ON payroll_component_definitions(country_code, code)
  WHERE tenant_id IS NULL AND country_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_components_tenant_code
  ON payroll_component_definitions(tenant_id, code)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_components_tenant_type
  ON payroll_component_definitions(tenant_id, component_type, is_active);

CREATE INDEX IF NOT EXISTS idx_payroll_components_country_type
  ON payroll_component_definitions(country_code, component_type, is_active);

CREATE INDEX IF NOT EXISTS idx_payroll_components_config_gin
  ON payroll_component_definitions USING GIN(calculation_config jsonb_path_ops);

INSERT INTO payroll_component_definitions (
  code, name, component_type, category, is_statutory, is_taxable,
  is_proratable, affects_gross, affects_net, payable_to_employee,
  employer_paid, sort_order, reporting_metadata
)
VALUES
  ('basic', 'Basic Salary', 'earning', 'base_pay', false, true, true, true, true, true, false, 10, '{"legacy_column":"basic"}'::jsonb),
  ('hra', 'House Rent Allowance', 'allowance', 'allowance', false, true, true, true, true, true, false, 20, '{"legacy_column":"hra"}'::jsonb),
  ('da', 'Dearness Allowance', 'allowance', 'allowance', false, true, true, true, true, true, false, 30, '{"legacy_column":"da"}'::jsonb),
  ('conveyance', 'Conveyance Allowance', 'allowance', 'allowance', false, true, true, true, true, true, false, 40, '{"legacy_column":"conveyance"}'::jsonb),
  ('medical', 'Medical Allowance', 'allowance', 'allowance', false, true, true, true, true, true, false, 50, '{"legacy_column":"medical"}'::jsonb),
  ('special_allowance', 'Special Allowance', 'allowance', 'allowance', false, true, true, true, true, true, false, 60, '{"legacy_column":"special_allowance"}'::jsonb),
  ('overtime', 'Overtime', 'earning', 'variable_pay', false, true, false, true, true, true, false, 70, '{"legacy_column":"overtime"}'::jsonb),
  ('bonus', 'Bonus', 'earning', 'variable_pay', false, true, false, true, true, true, false, 80, '{"legacy_column":"bonus"}'::jsonb),
  ('pf_employer', 'Provident Fund - Employer', 'pension', 'pension', true, false, true, false, false, false, true, 110, '{"legacy_column":"pf_employer"}'::jsonb),
  ('pf_employee', 'Provident Fund - Employee', 'pension', 'pension', true, false, true, false, true, false, false, 120, '{"legacy_salary_column":"pf_employee","legacy_payslip_column":"pf"}'::jsonb),
  ('esi_employer', 'Employee State Insurance - Employer', 'insurance', 'insurance', true, false, true, false, false, false, true, 130, '{"legacy_column":"esi_employer"}'::jsonb),
  ('esi_employee', 'Employee State Insurance - Employee', 'insurance', 'insurance', true, false, true, false, true, false, false, 140, '{"legacy_salary_column":"esi_employee","legacy_payslip_column":"esi"}'::jsonb),
  ('professional_tax', 'Professional Tax', 'tax', 'tax', true, false, false, false, true, false, false, 150, '{"legacy_column":"professional_tax"}'::jsonb),
  ('tds', 'Tax Deducted at Source', 'tax', 'tax', true, false, false, false, true, false, false, 160, '{"legacy_column":"tds"}'::jsonb),
  ('other_deductions', 'Other Deductions', 'deduction', 'deduction', false, false, false, false, true, false, false, 170, '{"legacy_column":"other_deductions"}'::jsonb),
  ('fine_deductions', 'Fine Deductions', 'deduction', 'deduction', false, false, false, false, true, false, false, 180, '{"legacy_column":"fine_deductions"}'::jsonb),
  ('reimbursement', 'Reimbursement', 'reimbursement', 'reimbursement', false, false, false, false, true, true, false, 210, '{"future_source":"reimbursements"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Flexible salary structure components
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salary_structure_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  salary_structure_id UUID NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  component_definition_id UUID REFERENCES payroll_component_definitions(id) ON DELETE SET NULL,
  component_code TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'earning',
    'deduction',
    'employer_contribution',
    'reimbursement',
    'tax',
    'pension',
    'insurance',
    'allowance',
    'informational'
  )),
  category TEXT,
  calculation_method TEXT NOT NULL DEFAULT 'fixed_amount',
  amount DECIMAL(14,2),
  percent_value DECIMAL(9,4),
  currency TEXT,
  currency_symbol VARCHAR(12),
  exchange_rate DECIMAL(18,8),
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  is_proratable BOOLEAN NOT NULL DEFAULT true,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  affects_gross BOOLEAN NOT NULL DEFAULT true,
  affects_net BOOLEAN NOT NULL DEFAULT true,
  payable_to_employee BOOLEAN NOT NULL DEFAULT true,
  employer_paid BOOLEAN NOT NULL DEFAULT false,
  calculation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  sort_order INT NOT NULL DEFAULT 100,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_salary_component_effective_range
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_structure_component_code
  ON salary_structure_components(salary_structure_id, component_code);

CREATE INDEX IF NOT EXISTS idx_salary_components_tenant_employee
  ON salary_structure_components(tenant_id, employee_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_salary_components_structure
  ON salary_structure_components(salary_structure_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_salary_components_type
  ON salary_structure_components(tenant_id, component_type, component_code);

CREATE INDEX IF NOT EXISTS idx_salary_components_metadata_gin
  ON salary_structure_components USING GIN(metadata jsonb_path_ops);

-- Mirror legacy salary structures into reusable components. This does not
-- change existing salary_structures values or payroll calculations.
INSERT INTO salary_structure_components (
  tenant_id, salary_structure_id, employee_id, component_definition_id,
  component_code, component_name, component_type, category, amount,
  currency, currency_symbol, exchange_rate, is_taxable, is_proratable,
  affects_gross, affects_net, payable_to_employee, employer_paid,
  source, sort_order, effective_from, effective_to, metadata
)
SELECT
  ss.tenant_id,
  ss.id,
  ss.employee_id,
  pcd.id,
  legacy.component_code,
  legacy.component_name,
  legacy.component_type,
  legacy.category,
  legacy.amount,
  COALESCE(ss.currency, pcd.default_currency, 'INR'),
  ss.currency_symbol,
  ss.exchange_rate,
  legacy.is_taxable,
  legacy.is_proratable,
  legacy.affects_gross,
  legacy.affects_net,
  legacy.payable_to_employee,
  legacy.employer_paid,
  'legacy_column',
  legacy.sort_order,
  ss.effective_from,
  ss.effective_to,
  jsonb_build_object('legacy_column', legacy.legacy_column)
FROM salary_structures ss
CROSS JOIN LATERAL (
  VALUES
    ('basic', 'Basic Salary', 'earning', 'base_pay', COALESCE(ss.basic, 0), true, true, true, true, true, false, 10, 'basic'),
    ('hra', 'House Rent Allowance', 'allowance', 'allowance', COALESCE(ss.hra, 0), true, true, true, true, true, false, 20, 'hra'),
    ('da', 'Dearness Allowance', 'allowance', 'allowance', COALESCE(ss.da, 0), true, true, true, true, true, false, 30, 'da'),
    ('conveyance', 'Conveyance Allowance', 'allowance', 'allowance', COALESCE(ss.conveyance, 0), true, true, true, true, true, false, 40, 'conveyance'),
    ('medical', 'Medical Allowance', 'allowance', 'allowance', COALESCE(ss.medical, 0), true, true, true, true, true, false, 50, 'medical'),
    ('special_allowance', 'Special Allowance', 'allowance', 'allowance', COALESCE(ss.special_allowance, 0), true, true, true, true, true, false, 60, 'special_allowance'),
    ('pf_employer', 'Provident Fund - Employer', 'pension', 'pension', COALESCE(ss.pf_employer, 0), false, true, false, false, false, true, 110, 'pf_employer'),
    ('pf_employee', 'Provident Fund - Employee', 'pension', 'pension', COALESCE(ss.pf_employee, 0), false, true, false, true, false, false, 120, 'pf_employee'),
    ('esi_employer', 'Employee State Insurance - Employer', 'insurance', 'insurance', COALESCE(ss.esi_employer, 0), false, true, false, false, false, true, 130, 'esi_employer'),
    ('esi_employee', 'Employee State Insurance - Employee', 'insurance', 'insurance', COALESCE(ss.esi_employee, 0), false, true, false, true, false, false, 140, 'esi_employee'),
    ('professional_tax', 'Professional Tax', 'tax', 'tax', COALESCE(ss.professional_tax, 0), false, false, false, true, false, false, 150, 'professional_tax'),
    ('tds', 'Tax Deducted at Source', 'tax', 'tax', COALESCE(ss.tds, 0), false, false, false, true, false, false, 160, 'tds')
) AS legacy(
  component_code, component_name, component_type, category, amount,
  is_taxable, is_proratable, affects_gross, affects_net,
  payable_to_employee, employer_paid, sort_order, legacy_column
)
LEFT JOIN payroll_component_definitions pcd
  ON pcd.tenant_id IS NULL
 AND pcd.country_code IS NULL
 AND pcd.code = legacy.component_code
ON CONFLICT (salary_structure_id, component_code) DO NOTHING;

UPDATE salary_structures
SET components_migrated_at = now()
WHERE components_migrated_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM salary_structure_components ssc
    WHERE ssc.salary_structure_id = salary_structures.id
  );

-- ---------------------------------------------------------------------------
-- Immutable payslip component snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payslip_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  salary_structure_component_id UUID REFERENCES salary_structure_components(id) ON DELETE SET NULL,
  component_definition_id UUID REFERENCES payroll_component_definitions(id) ON DELETE SET NULL,
  component_code TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'earning',
    'deduction',
    'employer_contribution',
    'reimbursement',
    'tax',
    'pension',
    'insurance',
    'allowance',
    'informational'
  )),
  category TEXT,
  calculation_method TEXT NOT NULL DEFAULT 'fixed_amount',
  base_amount DECIMAL(14,2),
  rate DECIMAL(14,6),
  units NUMERIC(12,4),
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency TEXT,
  currency_symbol VARCHAR(12),
  exchange_rate DECIMAL(18,8),
  taxable_amount DECIMAL(14,2),
  tax_exempt_amount DECIMAL(14,2),
  ytd_amount DECIMAL(14,2),
  is_taxable BOOLEAN NOT NULL DEFAULT false,
  is_prorated BOOLEAN NOT NULL DEFAULT false,
  affects_gross BOOLEAN NOT NULL DEFAULT true,
  affects_net BOOLEAN NOT NULL DEFAULT true,
  payable_to_employee BOOLEAN NOT NULL DEFAULT true,
  employer_paid BOOLEAN NOT NULL DEFAULT false,
  source_type TEXT,
  source_id UUID,
  calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_component_code
  ON payslip_components(payslip_id, component_code);

CREATE INDEX IF NOT EXISTS idx_payslip_components_tenant_run
  ON payslip_components(tenant_id, payroll_run_id, component_type, component_code);

CREATE INDEX IF NOT EXISTS idx_payslip_components_tenant_employee
  ON payslip_components(tenant_id, employee_id, component_code);

CREATE INDEX IF NOT EXISTS idx_payslip_components_payslip
  ON payslip_components(payslip_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_payslip_components_source
  ON payslip_components(source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payslip_components_snapshot_gin
  ON payslip_components USING GIN(calculation_snapshot jsonb_path_ops);

-- Mirror existing payslips into immutable component snapshots. This preserves
-- all existing payroll data while future payroll can write unlimited component
-- rows instead of expanding the payslips table again.
INSERT INTO payslip_components (
  tenant_id, payslip_id, payroll_run_id, employee_id, component_definition_id,
  component_code, component_name, component_type, category, amount,
  currency, currency_symbol, exchange_rate, is_taxable, is_prorated,
  affects_gross, affects_net, payable_to_employee, employer_paid,
  source_type, sort_order, calculation_snapshot, metadata
)
SELECT
  ps.tenant_id,
  ps.id,
  ps.payroll_run_id,
  ps.employee_id,
  pcd.id,
  legacy.component_code,
  legacy.component_name,
  legacy.component_type,
  legacy.category,
  legacy.amount,
  COALESCE(ps.currency, pcd.default_currency, 'INR'),
  ps.currency_symbol,
  ps.exchange_rate,
  legacy.is_taxable,
  false,
  legacy.affects_gross,
  legacy.affects_net,
  legacy.payable_to_employee,
  legacy.employer_paid,
  'legacy_column',
  legacy.sort_order,
  jsonb_build_object(
    'legacy_column', legacy.legacy_column,
    'pay_basis', ps.pay_basis,
    'calculation_method', ps.calculation_method
  ),
  jsonb_build_object('legacy_column', legacy.legacy_column)
FROM payslips ps
CROSS JOIN LATERAL (
  VALUES
    ('basic', 'Basic Salary', 'earning', 'base_pay', COALESCE(ps.basic, 0), true, true, true, true, false, 10, 'basic'),
    ('hra', 'House Rent Allowance', 'allowance', 'allowance', COALESCE(ps.hra, 0), true, true, true, true, false, 20, 'hra'),
    ('da', 'Dearness Allowance', 'allowance', 'allowance', COALESCE(ps.da, 0), true, true, true, true, false, 30, 'da'),
    ('conveyance', 'Conveyance Allowance', 'allowance', 'allowance', COALESCE(ps.conveyance, 0), true, true, true, true, false, 40, 'conveyance'),
    ('medical', 'Medical Allowance', 'allowance', 'allowance', COALESCE(ps.medical, 0), true, true, true, true, false, 50, 'medical'),
    ('special_allowance', 'Special Allowance', 'allowance', 'allowance', COALESCE(ps.special_allowance, 0), true, true, true, true, false, 60, 'special_allowance'),
    ('overtime', 'Overtime', 'earning', 'variable_pay', COALESCE(ps.overtime, 0), true, true, true, true, false, 70, 'overtime'),
    ('bonus', 'Bonus', 'earning', 'variable_pay', COALESCE(ps.bonus, 0), true, true, true, true, false, 80, 'bonus'),
    ('pf_employee', 'Provident Fund - Employee', 'pension', 'pension', COALESCE(ps.pf, 0), false, false, true, false, false, 120, 'pf'),
    ('esi_employee', 'Employee State Insurance - Employee', 'insurance', 'insurance', COALESCE(ps.esi, 0), false, false, true, false, false, 140, 'esi'),
    ('professional_tax', 'Professional Tax', 'tax', 'tax', COALESCE(ps.professional_tax, 0), false, false, true, false, false, 150, 'professional_tax'),
    ('tds', 'Tax Deducted at Source', 'tax', 'tax', COALESCE(ps.tds, 0), false, false, true, false, false, 160, 'tds'),
    ('other_deductions', 'Other Deductions', 'deduction', 'deduction', COALESCE(ps.other_deductions, 0), false, false, true, false, false, 170, 'other_deductions'),
    ('fine_deductions', 'Fine Deductions', 'deduction', 'deduction', COALESCE(ps.fine_deductions, 0), false, false, true, false, false, 180, 'fine_deductions')
) AS legacy(
  component_code, component_name, component_type, category, amount,
  is_taxable, affects_gross, affects_net, payable_to_employee,
  employer_paid, sort_order, legacy_column
)
LEFT JOIN payroll_component_definitions pcd
  ON pcd.tenant_id IS NULL
 AND pcd.country_code IS NULL
 AND pcd.code = legacy.component_code
ON CONFLICT (payslip_id, component_code) DO NOTHING;

UPDATE payslips
SET
  components_migrated_at = now(),
  component_totals = jsonb_build_object(
    'earnings', COALESCE(gross_salary, 0),
    'deductions', COALESCE(total_deductions, 0),
    'net', COALESCE(net_salary, 0),
    'legacy', true
  )
WHERE components_migrated_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM payslip_components pc
    WHERE pc.payslip_id = payslips.id
  );

-- ---------------------------------------------------------------------------
-- Future statutory rules for country/org-specific tax, pension, insurance,
-- allowances, and reimbursement handling. These rules are inert until payroll
-- services choose to read them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_statutory_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  payroll_profile_id UUID REFERENCES payroll_profiles(id) ON DELETE CASCADE,
  country_code VARCHAR(2) NOT NULL,
  jurisdiction_code TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'tax',
    'pension',
    'insurance',
    'allowance',
    'reimbursement',
    'employer_contribution',
    'deduction',
    'earning'
  )),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  component_definition_id UUID REFERENCES payroll_component_definitions(id) ON DELETE SET NULL,
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  thresholds JSONB NOT NULL DEFAULT '[]'::jsonb,
  rates JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payroll_statutory_rules_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_stat_rules_global
  ON payroll_statutory_rules(country_code, jurisdiction_code, rule_type, code, effective_from)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_stat_rules_tenant
  ON payroll_statutory_rules(tenant_id, country_code, jurisdiction_code, rule_type, code, effective_from)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_stat_rules_profile
  ON payroll_statutory_rules(payroll_profile_id, rule_type, effective_from DESC)
  WHERE payroll_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_stat_rules_config_gin
  ON payroll_statutory_rules USING GIN(rule_config jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Documentation comments for the transition period.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE payroll_component_definitions IS
  'Reusable payroll component catalog. Supports global, country-specific, and tenant-specific earnings, deductions, tax, pension, insurance, allowances, and reimbursements.';

COMMENT ON TABLE salary_structure_components IS
  'Flexible component rows for salary structures. Legacy salary_structures columns remain authoritative until payroll calculation code is migrated.';

COMMENT ON TABLE payslip_components IS
  'Immutable component snapshot rows for payslips. Legacy payslips columns remain authoritative until payroll calculation code is migrated.';

COMMENT ON COLUMN salary_structures.components_migrated_at IS
  'Set when legacy salary columns have been mirrored into salary_structure_components. Does not change calculation behavior.';

COMMENT ON COLUMN payslips.components_migrated_at IS
  'Set when legacy payslip columns have been mirrored into payslip_components. Does not change payslip behavior.';
