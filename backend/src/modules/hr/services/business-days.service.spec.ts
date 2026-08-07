import { BusinessDaysService } from './business-days.service';

describe('BusinessDaysService', () => {
  let db: { query: jest.Mock };
  let service: BusinessDaysService;

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new BusinessDaysService(db as any);
  });

  describe('getWorkWeek()', () => {
    it('returns the stored org work-week config when present', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ work_week_config: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false } }],
      });
      const week = await service.getWorkWeek('t1');
      expect(week.sat).toBe(true);
      expect(week.sun).toBe(false);
    });

    it('falls back to Mon-Fri when no config is stored', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ work_week_config: null }] });
      const week = await service.getWorkWeek('t1');
      expect(week).toEqual({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false });
    });
  });

  describe('classifyPeriod()', () => {
    // 2026-01-01 = Thu, 01-02 = Fri, 01-03 = Sat, 01-04 = Sun
    it('classifies a holiday, weekly-offs, and a business day, with holiday taking priority over a same-date weekly off', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ work_week_config: null }] }) // Mon-Fri work week, Sat/Sun off
        .mockResolvedValueOnce({ rows: [{ holiday_date: '2026-01-03' }] }); // holiday lands on what would be a Saturday weekly-off

      const result = await service.classifyPeriod('t1', 'b1', '2026-01-01', '2026-01-04');

      expect(result.get('2026-01-01')).toBe('business');
      expect(result.get('2026-01-02')).toBe('business');
      expect(result.get('2026-01-03')).toBe('holiday'); // holiday wins over weekly-off
      expect(result.get('2026-01-04')).toBe('weekly_off'); // plain Sunday, no holiday
    });
  });

  describe('countBusinessDays()', () => {
    it('derives business/holiday/weekly-off counts from the same classification', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ work_week_config: null }] })
        .mockResolvedValueOnce({ rows: [{ holiday_date: '2026-01-03' }] });

      const result = await service.countBusinessDays('t1', 'b1', '2026-01-01', '2026-01-04');

      expect(result).toEqual({ businessWorkingDays: 2, holidayDays: 1, weeklyOffDays: 1, calendarDays: 4 });
    });
  });
});
