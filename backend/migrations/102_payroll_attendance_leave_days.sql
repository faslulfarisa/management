-- Migration 102: Track leave days separately on the payroll attendance summary.
--
-- AttendanceFinalizationService previously computed absent_days as
-- (total_working_days - present_days), which counted employees on approved
-- leave as absent. Additive column only — safe on existing rows (defaults to 0).

ALTER TABLE payroll_attendance_summary
  ADD COLUMN IF NOT EXISTS leave_days INT NOT NULL DEFAULT 0;
