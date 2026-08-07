export interface AttendanceStatusResult {
  code: string;
  label: string;
  emoji: string;
  clockIn?: string;
  clockOut?: string;
  lateMinutes?: number;
  breakLabel?: string;
}

export function mapAttendanceStatus(record: any): AttendanceStatusResult {
  if (!record) {
    return { code: 'not_punched_in', label: 'Not Yet Punched In', emoji: '⚪' };
  }
  if (record.is_on_break) {
    const breakLabel = record.current_break?.reason_label;
    return {
      code: 'on_break',
      label: breakLabel ? breakLabel : 'On Break',
      emoji: '🟡',
      clockIn: record.clock_in,
      breakLabel,
    };
  }
  if (record.clock_out) {
    return { code: 'checked_out', label: 'Checked Out', emoji: '🔵', clockIn: record.clock_in, clockOut: record.clock_out };
  }
  if (record.status === 'absent' && !record.clock_in) {
    return { code: 'absent', label: 'Absent', emoji: '🔴' };
  }
  if (record.clock_in && record.late_minutes > 0) {
    return { code: 'late', label: 'Late', emoji: '🟠', clockIn: record.clock_in, lateMinutes: record.late_minutes };
  }
  if (record.clock_in) {
    return { code: 'present', label: 'Present', emoji: '🟢', clockIn: record.clock_in };
  }
  return { code: 'not_punched_in', label: 'Not Yet Punched In', emoji: '⚪' };
}
