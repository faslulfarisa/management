import { calculateLastWorkingDate, calculateNoticePeriodWindow, calculateRemainingNoticeDays, calculateNoticePayRecovery } from './notice-period.util';

describe('notice-period.util', () => {
  describe('calculateLastWorkingDate()', () => {
    it('adds the full notice period to the requested date', () => {
      expect(calculateLastWorkingDate('2026-06-01', 30)).toBe('2026-07-01');
    });

    it('subtracts waived days from the notice period', () => {
      expect(calculateLastWorkingDate('2026-06-01', 30, 10)).toBe('2026-06-21');
    });

    it('floors the effective notice at the requested date when waived days exceed the notice period', () => {
      expect(calculateLastWorkingDate('2026-06-01', 30, 45)).toBe('2026-06-01');
    });
  });

  describe('calculateNoticePeriodWindow()', () => {
    it('returns the requested date as the start and last working date as the end', () => {
      expect(calculateNoticePeriodWindow('2026-06-01', '2026-07-01')).toEqual({
        noticeStartDate: '2026-06-01',
        noticeEndDate: '2026-07-01',
      });
    });
  });

  describe('calculateRemainingNoticeDays()', () => {
    it('returns the number of days remaining until notice end', () => {
      expect(calculateRemainingNoticeDays('2026-07-01', '2026-06-21')).toBe(10);
    });

    it('floors at zero once notice end has passed', () => {
      expect(calculateRemainingNoticeDays('2026-06-01', '2026-06-21')).toBe(0);
    });
  });

  describe('calculateNoticePayRecovery()', () => {
    it('charges the shortfall at the daily rate when notice is not fully served', () => {
      // 30-day notice, only 20 served, no waiver -> 10 days recovered
      expect(calculateNoticePayRecovery(1000, 30, 20)).toBe(10000);
    });

    it('reduces the recoverable shortfall by waived days', () => {
      expect(calculateNoticePayRecovery(1000, 30, 20, 10)).toBe(0);
    });

    it('returns zero once the full notice period has been served', () => {
      expect(calculateNoticePayRecovery(1000, 30, 30)).toBe(0);
    });

    it('never returns a negative recovery when served days exceed the notice period', () => {
      expect(calculateNoticePayRecovery(1000, 30, 45)).toBe(0);
    });
  });
});
