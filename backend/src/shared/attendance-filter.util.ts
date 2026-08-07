import { ATTENDANCE_WORKFORCE_STATUS_SQL } from './employee-status.constants';

/**
 * Correlated EXISTS/NOT EXISTS fragment (referencing outer alias `e`) for the
 * "today" attendance buckets surfaced as clickable dashboard stat cards.
 * Shared by every employee-list query so the list and its stat-card count
 * always agree on what "absent today" etc. means.
 */
export function attendanceFilterSql(attendance: string): string | null {
  const attendanceWorkforceClause = `e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`;

  switch (attendance) {
    case 'present_today':
      return `${attendanceWorkforceClause} AND EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
          AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
      )`;
    case 'punched_in':
      return `${attendanceWorkforceClause} AND EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
          AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL AND ar.clock_out IS NULL
      )`;
    case 'absent_today':
      return `${attendanceWorkforceClause} AND NOT EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
          AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
      )`;
    case 'late_today':
      return `${attendanceWorkforceClause} AND EXISTS (
        SELECT 1 FROM attendance_records ar
        WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
          AND ar.date = CURRENT_DATE AND ar.late_minutes > 0
      )`;
    case 'early_leave_today':
      return `${attendanceWorkforceClause} AND (
        EXISTS (
          SELECT 1 FROM leave_requests lr
          WHERE lr.tenant_id = e.tenant_id AND lr.employee_id = e.id
            AND lr.status = 'approved' AND lr.days = 0.5
            AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
        )
        OR EXISTS (
          SELECT 1 FROM attendance_records ar
          LEFT JOIN shift_assignments sa ON sa.tenant_id = ar.tenant_id AND sa.employee_id = ar.employee_id
            AND sa.is_active = true AND sa.start_date <= ar.date AND (sa.end_date IS NULL OR sa.end_date >= ar.date)
          LEFT JOIN shift_definitions sd ON sd.id = sa.shift_id
          WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
            AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
            AND (ar.clock_in AT TIME ZONE 'UTC')::time > COALESCE(sd.start_time + (sd.end_time - sd.start_time) / 2, TIME '12:00:00')
        )
      )`;
    default:
      return null;
  }
}
