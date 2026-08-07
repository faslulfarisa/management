-- 150_attendance_request_requested_times.sql
-- Store employee-requested punch corrections so approval can update attendance_records.

ALTER TABLE attendance_requests
  ADD COLUMN IF NOT EXISTS requested_clock_in TIME,
  ADD COLUMN IF NOT EXISTS requested_clock_out TIME,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_attendance_requests_pending_corrections
  ON attendance_requests(tenant_id, status, request_type, date)
  WHERE status = 'pending' AND request_type = 'correction';
