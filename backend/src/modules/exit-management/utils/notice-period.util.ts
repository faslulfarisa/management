/** Pure notice-period date/recovery math — kept dependency-free for unit testing. */

/**
 * `pg` returns DATE columns as JS `Date` objects, not strings, since this
 * codebase doesn't override the driver's default type parsers. Concatenating
 * a Date into a template string (`date + 'T00:00:00Z'`) silently produces a
 * garbage date instead of throwing, so every DB-sourced date must be
 * normalized through this before reaching the rest of this module.
 */
export function toDateOnlyString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function addDays(date: string | Date, days: number): string {
  const d = new Date(toDateOnlyString(date) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const s = new Date(toDateOnlyString(start) + 'T00:00:00Z').getTime();
  const e = new Date(toDateOnlyString(end) + 'T00:00:00Z').getTime();
  return Math.round((e - s) / 86400000);
}

/**
 * Last working date = requested date + notice period, minus any waived days,
 * floored at the requested date itself (a waiver can't move the date earlier
 * than the request was filed).
 */
export function calculateLastWorkingDate(
  requestedDate: string | Date,
  noticePeriodDays: number,
  waivedDays = 0,
): string {
  const effectiveDays = Math.max(noticePeriodDays - waivedDays, 0);
  return addDays(requestedDate, effectiveDays);
}

export function calculateNoticePeriodWindow(requestedDate: string, lastWorkingDate: string) {
  return { noticeStartDate: requestedDate, noticeEndDate: lastWorkingDate };
}

export function calculateRemainingNoticeDays(noticeEndDate: string, asOfDate: string): number {
  return Math.max(daysBetween(asOfDate, noticeEndDate), 0);
}

/**
 * If the employee leaves before serving the full notice period and there is
 * no waiver on file, the shortfall is recovered from their settlement at the
 * given daily rate. A waiver (waivedDays >= shortfall) zeroes the recovery.
 */
export function calculateNoticePayRecovery(
  dailyRate: number,
  noticePeriodDays: number,
  daysActuallyServed: number,
  waivedDays = 0,
): number {
  const shortfall = Math.max(noticePeriodDays - daysActuallyServed - waivedDays, 0);
  return Math.round(dailyRate * shortfall * 100) / 100;
}
