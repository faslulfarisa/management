-- Migration 092: Branch-filtered live dashboard index
-- Split out from 026_attendance_indexes.sql, which ran before
-- attendance_records.branch_id existed (added in migration 050).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_branch_time
  ON attendance_records(tenant_id, branch_id, date DESC)
  WHERE branch_id IS NOT NULL;
