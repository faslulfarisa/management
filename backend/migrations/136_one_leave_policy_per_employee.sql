-- Ensure one active direct leave-policy template assignment per employee.
-- If historical duplicates exist, keep the highest-priority/latest assignment
-- and soft-delete the rest before adding the guard index.

WITH ranked_assignments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, scope_id
      ORDER BY priority DESC, created_at DESC, id DESC
    ) AS rn
  FROM template_assignments
  WHERE template_type = 'leave_policy'
    AND scope_type = 'employee'
    AND deleted_at IS NULL
)
UPDATE template_assignments ta
SET deleted_at = now(),
    updated_at = now()
FROM ranked_assignments ranked
WHERE ta.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ta_one_active_leave_policy_per_employee
  ON template_assignments (tenant_id, scope_id)
  WHERE template_type = 'leave_policy'
    AND scope_type = 'employee'
    AND deleted_at IS NULL;
