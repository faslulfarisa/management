-- 082_minimize_deactivation_reasons.sql
-- Reduce the selectable deactivation reason list from 18 to 4 core reasons.
-- The other rows are kept (is_active = false) rather than deleted so any
-- existing users.deactivation_reason_id / user_status_history.reason_id
-- references and historical reporting remain intact.

UPDATE deactivation_reasons
SET is_active = FALSE
WHERE tenant_id IS NULL
  AND code NOT IN ('resigned', 'terminated', 'policy_violation', 'long_leave');
