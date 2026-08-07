-- Migration 113: final_settlements.approval_date
-- Migration 108 added `approved_by` to final_settlements for the approval-engine
-- ENTITY_SYNC_CONFIG sync but missed `approval_date` (exit_requests already had
-- this column from the original schema, which masked the gap until a real
-- settlement approval was exercised against the live database).

ALTER TABLE final_settlements
  ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ;
