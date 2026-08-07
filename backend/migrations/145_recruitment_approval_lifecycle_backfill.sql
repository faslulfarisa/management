-- Backfill recruitment entities whose approval engine status was resolved
-- through the centralized approvals inbox before lifecycle status sync existed.

UPDATE vacancies
SET status = 'open',
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status = 'approved'
  AND deleted_at IS NULL;

UPDATE vacancies
SET status = 'rejected',
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status = 'rejected'
  AND deleted_at IS NULL;

UPDATE job_descriptions
SET status = approval_status,
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status IN ('approved', 'rejected')
  AND deleted_at IS NULL;

UPDATE offers
SET status = approval_status,
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status IN ('approved', 'rejected')
  AND deleted_at IS NULL;

UPDATE probation_reviews
SET status = approval_status,
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status IN ('approved', 'rejected')
  AND deleted_at IS NULL;

UPDATE workforce_plans
SET status = CASE
      WHEN approval_status = 'approved' THEN 'active'
      WHEN approval_status = 'rejected' THEN 'rejected'
      ELSE status
    END,
    updated_at = now()
WHERE status = 'pending_approval'
  AND approval_status IN ('approved', 'rejected')
  AND deleted_at IS NULL;
