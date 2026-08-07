-- 142_add_pay_basis_to_payslips.sql
-- Add reporting columns for Pay Basis enhancement

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS pay_basis TEXT DEFAULT 'monthly_salary',
  ADD COLUMN IF NOT EXISTS rate DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS worked_units NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS calculation_method TEXT DEFAULT 'Monthly Salary';

-- Backfill existing records
UPDATE payslips
SET pay_basis = 'monthly_salary'
WHERE pay_basis IS NULL;

UPDATE payslips
SET calculation_method = 'Monthly Salary'
WHERE calculation_method IS NULL;

UPDATE payslips
SET rate = COALESCE(basic, 0),
    worked_units = 1
WHERE rate IS NULL;
