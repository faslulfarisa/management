import { ATTENDANCE_WORKFORCE_STATUSES } from './employee-status.constants';
import { attendanceFilterSql } from './attendance-filter.util';

describe('attendanceFilterSql', () => {
  it('limits every dashboard attendance filter to the active attendance workforce', () => {
    const filters = ['present_today', 'punched_in', 'absent_today', 'late_today', 'early_leave_today'];

    for (const filter of filters) {
      const sql = attendanceFilterSql(filter);

      expect(sql).toContain('e.status = ANY');
      for (const status of ATTENDANCE_WORKFORCE_STATUSES) {
        expect(sql).toContain(`'${status}'`);
      }
    }
  });

  it('defines present today by clock-in rather than only raw present status', () => {
    const sql = attendanceFilterSql('present_today');

    expect(sql).toContain('ar.clock_in IS NOT NULL');
    expect(sql).not.toContain("ar.status = 'present'");
  });

  it('keeps absent today as active workforce employees without a clock-in', () => {
    const sql = attendanceFilterSql('absent_today');

    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('ar.clock_in IS NOT NULL');
  });
});
