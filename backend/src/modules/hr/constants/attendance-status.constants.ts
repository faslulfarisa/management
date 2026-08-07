// Canonical attendance-status -> bucket classification, shared by every
// service that needs to turn a raw `attendance_records.status` value into a
// payroll/performance-relevant bucket (AttendanceSummaryService,
// AttendanceBehaviourEngineService). Single source of truth so the monthly
// payroll summary and the performance scoring engine never disagree on what
// counts as "present".
export type Bucket = 'present' | 'half_day' | 'absent' | 'holiday' | 'weekly_off' | 'paid_leave' | 'unpaid_leave';

// All "worked" statuses are payroll-equivalent to present. Early-exit/late are
// modifiers captured separately (late_count), not distinct buckets — matches
// the 8 summary columns the table UI actually surfaces.
export const STATUS_BUCKET: Record<string, Bucket> = {
  present: 'present', work_from_home: 'present', wfh: 'present', remote_work: 'present',
  business_travel: 'present', training: 'present', on_duty: 'present', comp_off: 'present',
  early_exit: 'present', late: 'present',
  half_day: 'half_day',
  absent: 'absent',
  holiday: 'holiday',
  weekly_off: 'weekly_off',
  paid_leave: 'paid_leave',
  unpaid_leave: 'unpaid_leave',
};
