-- 037_emp_code_prefix.sql
-- Add employee code prefix to organizations (tenants)
-- The prefix defines which org an employee belongs to based on the first N chars of their emp code

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS emp_code_prefix TEXT,
  ADD COLUMN IF NOT EXISTS emp_code_digits INT DEFAULT 4;

-- Unique prefix per active org
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_emp_code_prefix
  ON tenants(emp_code_prefix) WHERE deleted_at IS NULL AND emp_code_prefix IS NOT NULL;
