-- 083_simplify_deactivation_reasons.sql
-- Trim the active reason list down to 5 simple, clearly-labeled options:
-- Resigned, Terminated, Suspended, Long Leave, Other.
-- All other reason rows remain (is_active = false) for historical references.

-- Re-activate "Other" as the catch-all reason.
UPDATE deactivation_reasons
SET is_active = TRUE, label = 'Other'
WHERE tenant_id IS NULL AND code = 'other';

-- Relabel the "Policy Violation" reason (already maps to suspended) as a plain "Suspended".
UPDATE deactivation_reasons
SET label = 'Suspended'
WHERE tenant_id IS NULL AND code = 'policy_violation';
