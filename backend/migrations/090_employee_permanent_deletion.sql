-- 090_employee_permanent_deletion.sql
-- Anonymization tracking for the employee permanent-deletion workflow.
-- SAFE: fully additive, no existing table modifications.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_anonymized BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employees_is_anonymized ON employees(is_anonymized) WHERE is_anonymized = true;
