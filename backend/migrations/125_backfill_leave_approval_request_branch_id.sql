-- Migration 125: Backfill branch_id on historical leave approval requests.
-- Older leave approval rows may have been created without approval_requests.branch_id.
-- Only rows whose employee now has a branch are updated; truly unassigned employees
-- remain org-admin-only until their employee profile is assigned to a branch.

UPDATE approval_requests ar
SET branch_id = e.branch_id,
    updated_at = now()
FROM leave_requests lr
JOIN employees e ON e.id = lr.employee_id
WHERE ar.entity_table = 'leave_requests'
  AND ar.entity_id = lr.id
  AND ar.workflow_type = 'leave'
  AND ar.branch_id IS NULL
  AND e.branch_id IS NOT NULL;

UPDATE approval_requests ar
SET branch_id = e.branch_id,
    updated_at = now()
FROM leave_encashment_requests ler
JOIN employees e ON e.id = ler.employee_id
WHERE ar.entity_table = 'leave_encashment_requests'
  AND ar.entity_id = ler.id
  AND ar.workflow_type = 'leave_encashment'
  AND ar.branch_id IS NULL
  AND e.branch_id IS NOT NULL;
