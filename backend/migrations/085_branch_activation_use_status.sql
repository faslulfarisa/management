-- 085_branch_activation_use_status.sql
-- Simplify subscription-gated branch activation: drop the separate
-- "is_activated" flag introduced in 084 and drive plan-based activation
-- purely off the existing "is_active"/"status" lifecycle columns.
--
-- A branch locked by the plan is now genuinely is_active=false /
-- status='inactive' (non-usable), the same as a manually deactivated
-- branch. The "locked by plan" vs "inactive" distinction shown in the UI
-- becomes a computed label (see BranchActivationService.computeStatus),
-- not a stored column.

-- Any branch that was created-but-not-yet-activated under 084 becomes
-- properly inactive/non-usable.
UPDATE branches
SET is_active = false, status = 'inactive', updated_at = now()
WHERE is_activated = false AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_branches_activation;

ALTER TABLE branches DROP COLUMN IF EXISTS is_activated;
