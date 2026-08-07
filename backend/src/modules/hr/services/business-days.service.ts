import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WorkWeekConfig = Record<DayKey, boolean>;

// Date.getUTCDay() is 0=Sunday..6=Saturday — index this array with that value.
const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DEFAULT_WORK_WEEK: WorkWeekConfig = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
};

export type DayClassification = 'business' | 'weekly_off' | 'holiday';

/**
 * Resolves an organization's work-week configuration and holiday calendar into a
 * day-by-day classification — the single source of truth for both the
 * business-working-days divisor and the holiday/weekly-off buckets on an
 * attendance summary.
 */
@Injectable()
export class BusinessDaysService {
  constructor(private readonly db: DatabaseService) {}

  async getWorkWeek(tenantId: string): Promise<WorkWeekConfig> {
    const { rows } = await this.db.query(
      `SELECT work_week_config FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const config = rows[0]?.work_week_config;
    if (config && typeof config === 'object') {
      return { ...DEFAULT_WORK_WEEK, ...config };
    }
    return DEFAULT_WORK_WEEK;
  }

  /** Org-wide holidays (branch_id IS NULL) plus any matching the given branch. */
  async getHolidaySet(
    tenantId: string,
    branchId: string | null,
    periodStart: string,
    periodEnd: string,
  ): Promise<Set<string>> {
    const { rows } = await this.db.query(
      `SELECT holiday_date FROM holidays
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND holiday_date BETWEEN $2 AND $3
         AND (branch_id IS NULL OR branch_id = $4)`,
      [tenantId, periodStart, periodEnd, branchId],
    );
    return new Set(rows.map((r: any) => this._toIsoDate(r.holiday_date)));
  }

  /**
   * Classifies every calendar day in [periodStart, periodEnd] as a business
   * working day, a weekly off, or a holiday (holiday takes priority over a
   * weekly off that lands on the same date, to avoid double-counting).
   */
  async classifyPeriod(
    tenantId: string,
    branchId: string | null,
    periodStart: string,
    periodEnd: string,
  ): Promise<Map<string, DayClassification>> {
    const workWeek = await this.getWorkWeek(tenantId);
    const holidays = await this.getHolidaySet(tenantId, branchId, periodStart, periodEnd);

    const result = new Map<string, DayClassification>();
    const start = new Date(`${periodStart}T00:00:00Z`);
    const end = new Date(`${periodEnd}T00:00:00Z`);

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().split('T')[0];
      if (holidays.has(iso)) {
        result.set(iso, 'holiday');
      } else if (!workWeek[DAY_KEYS[d.getUTCDay()]]) {
        result.set(iso, 'weekly_off');
      } else {
        result.set(iso, 'business');
      }
    }
    return result;
  }

  /** Convenience: business working day count for a period (calendar days minus holidays/weekly-offs). */
  async countBusinessDays(
    tenantId: string,
    branchId: string | null,
    periodStart: string,
    periodEnd: string,
  ): Promise<{ businessWorkingDays: number; holidayDays: number; weeklyOffDays: number; calendarDays: number }> {
    const classification = await this.classifyPeriod(tenantId, branchId, periodStart, periodEnd);
    let businessWorkingDays = 0;
    let holidayDays = 0;
    let weeklyOffDays = 0;
    for (const bucket of classification.values()) {
      if (bucket === 'business') businessWorkingDays++;
      else if (bucket === 'holiday') holidayDays++;
      else weeklyOffDays++;
    }
    return { businessWorkingDays, holidayDays, weeklyOffDays, calendarDays: classification.size };
  }

  private _toIsoDate(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().split('T')[0];
    return String(value).split('T')[0];
  }
}
