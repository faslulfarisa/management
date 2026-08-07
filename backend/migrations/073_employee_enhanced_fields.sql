-- 073_employee_enhanced_fields.sql
-- Extended employee profile fields for enterprise HR onboarding workflow.
-- Adds personal, contact, identity, payroll, and biometric fields.
-- Also links optional application user (user_id) to support employee-only records.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS office_email TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS office_telephone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS driving_license_number TEXT,
  ADD COLUMN IF NOT EXISTS voter_id TEXT,
  ADD COLUMN IF NOT EXISTS employee_card_number TEXT,
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS salary_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS biometric_employee_id TEXT,
  ADD COLUMN IF NOT EXISTS device_code TEXT,
  ADD COLUMN IF NOT EXISTS card_number TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Prevent duplicate biometric IDs within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_biometric_id
  ON employees(tenant_id, biometric_employee_id)
  WHERE biometric_employee_id IS NOT NULL AND deleted_at IS NULL;

-- Fast lookup by linked user
CREATE INDEX IF NOT EXISTS idx_employees_user_id
  ON employees(user_id)
  WHERE user_id IS NOT NULL;
