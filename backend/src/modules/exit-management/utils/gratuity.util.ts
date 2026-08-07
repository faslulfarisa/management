/** Pure gratuity math (Payment of Gratuity Act formula) — dependency-free for unit testing. */
import { toDateOnlyString } from './notice-period.util';

export interface GratuityPolicy {
  /** Minimum years of continuous service to be gratuity-eligible. Default 5. */
  minYearsOfService?: number;
  /** Days of basic salary credited per year of service. Default 15. */
  daysPerYear?: number;
  /** Divisor for the monthly-to-daily basic conversion. Default 26 (working days/month). */
  monthDivisor?: number;
}

/**
 * Calendar-based years of service (not a fixed-day-year approximation like
 * ms / 365.25days — that approach puts an exact N-year tenure fractionally
 * *under* N once a leap year falls inside the range, which would wrongly
 * fail the eligibility threshold for someone who served exactly 5 years).
 */
export function calculateYearsOfService(dateOfJoining: string | Date, lastWorkingDate: string | Date): number {
  const join = new Date(toDateOnlyString(dateOfJoining) + 'T00:00:00Z');
  const exit = new Date(toDateOnlyString(lastWorkingDate) + 'T00:00:00Z');

  let years = exit.getUTCFullYear() - join.getUTCFullYear();
  let months = exit.getUTCMonth() - join.getUTCMonth();
  if (exit.getUTCDate() < join.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return Math.max(years + months / 12, 0);
}

/**
 * 15 * last drawn basic * years of service / 26, rounded to the nearest
 * whole year of service (the statutory rounding: >=6 months counts as a
 * full additional year). Returns 0 if under the eligibility threshold.
 */
export function calculateGratuity(
  lastDrawnBasic: number,
  dateOfJoining: string | Date,
  lastWorkingDate: string | Date,
  policy: GratuityPolicy = {},
): { eligible: boolean; yearsOfService: number; amount: number } {
  const minYears = policy.minYearsOfService ?? 5;
  const daysPerYear = policy.daysPerYear ?? 15;
  const monthDivisor = policy.monthDivisor ?? 26;

  const exactYears = calculateYearsOfService(dateOfJoining, lastWorkingDate);
  const completedYears = Math.floor(exactYears);
  const remainderMonths = (exactYears - completedYears) * 12;
  const roundedYears = remainderMonths >= 6 ? completedYears + 1 : completedYears;

  if (exactYears < minYears) {
    return { eligible: false, yearsOfService: Math.round(exactYears * 100) / 100, amount: 0 };
  }

  const amount = (daysPerYear * lastDrawnBasic * roundedYears) / monthDivisor;
  return {
    eligible: true,
    yearsOfService: Math.round(exactYears * 100) / 100,
    amount: Math.round(amount * 100) / 100,
  };
}
