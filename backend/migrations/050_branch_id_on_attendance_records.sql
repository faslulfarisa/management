-- Migration 050: Add branch_id to attendance_records
-- Phase 3 of Branch module integration

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- Backfill from the employee's branch assignment
UPDATE attendance_records a
SET    branch_id = e.branch_id
FROM   employees e
WHERE  e.id = a.employee_id
  AND  a.branch_id IS NULL
  AND  e.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_branch        ON attendance_records(branch_id)            WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_tenant_branch ON attendance_records(tenant_id, branch_id) WHERE branch_id IS NOT NULL;
