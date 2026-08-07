import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';

export interface SummaryScope {
  type: 'organization' | 'branch' | 'department' | 'employees' | 'employee';
  branchId?: string;
  departmentId?: string;
  employeeIds?: string[];
}

/**
 * Owns the payroll-lock boundary: locking/unlocking attendance summaries
 * (org-wide or partial), and the guard every attendance/leave/overtime
 * mutation must pass before touching an already-locked payroll period.
 *
 * Lives in the platform module (not hr) so the generic approval engine
 * (`ApprovalEngineService`, in the approvals module) can enforce the lock
 * on overtime approvals without a circular hr<->approvals module edge —
 * platform is already a non-circular dependency of both.
 */
@Injectable()
export class PayrollLockService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Throws if any date in [fromDate, toDate] for this employee falls inside a
   * payroll_locked or payroll_processed summary. Call before creating/approving
   * any attendance correction, leave request, or overtime request.
   */
  async assertPeriodUnlocked(
    tenantId: string,
    employeeId: string,
    fromDate: string,
    toDate?: string,
  ): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT id, period_start, period_end FROM payroll_attendance_summary
       WHERE tenant_id = $1 AND employee_id = $2
         AND status = 'payroll_locked'
         AND period_start <= $4 AND period_end >= $3
       LIMIT 1`,
      [tenantId, employeeId, fromDate, toDate ?? fromDate],
    );
    if (rows.length) {
      const { period_start, period_end } = rows[0];
      throw new BadRequestException(
        `Payroll for ${period_start} to ${period_end} is locked. This change would affect a locked payroll ` +
          `period — ask an authorized user to unlock it first.`,
      );
    }
  }

  async lock(
    tenantId: string,
    year: number,
    month: number,
    scope: SummaryScope,
    userId: string,
    reason: string,
  ): Promise<{ locked: number; summaryIds: string[]; employeeIds: string[] }> {
    if (!reason?.trim()) throw new BadRequestException('A lock reason is required');
    const { periodStart, periodEnd } = this._periodFor(year, month);
    const { clause, params } = this._scopeClause(scope, [tenantId, periodStart, periodEnd]);

    const { rows: blockers } = await this.db.query(
      `SELECT COUNT(*) FROM payroll_attendance_summary
       WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3
         AND status IN ('draft', 'pending_review') AND ${clause}`,
      params,
    );
    const blockerCount = parseInt(blockers[0]?.count ?? '0', 10);
    if (blockerCount > 0) {
      throw new BadRequestException(
        `Cannot lock: ${blockerCount} summary(ies) in the selected scope are still in Draft or Pending Review.`,
      );
    }

    // locked_by/lock_reason must be placed *after* whatever placeholders the
    // scope clause used — it can be $4 (organization) up to $4+N (employees
    // list), so these can't be hardcoded without colliding with it.
    const lockedByIdx = params.length + 1;
    const reasonIdx = params.length + 2;
    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'payroll_locked', locked_by = $${lockedByIdx}, locked_at = now(), lock_reason = $${reasonIdx}, updated_at = now()
       WHERE tenant_id = $1 AND period_start = $2 AND period_end = $3 AND status = 'approved' AND ${clause}
       RETURNING id, employee_id`,
      [...params, userId, reason],
    );
    if (!rows.length) {
      throw new BadRequestException('No approved summaries found in the selected scope to lock.');
    }

    for (const row of rows) {
      await this.auditLog.log({
        tenantId, userId, entityType: 'attendance_summary', entityId: row.id,
        action: 'payroll_locked',
        newValues: { reason, period_start: periodStart, period_end: periodEnd, scope },
      });
    }

    return { locked: rows.length, summaryIds: rows.map((r: any) => r.id), employeeIds: rows.map((r: any) => r.employee_id) };
  }

  async unlock(
    tenantId: string,
    summaryIds: string[],
    userId: string,
    reason: string,
  ): Promise<{ unlocked: number; employeeIds: string[] }> {
    if (!reason?.trim()) throw new BadRequestException('An unlock reason is required');
    if (!summaryIds?.length) throw new BadRequestException('No summaries specified to unlock');

    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'approved', locked_by = NULL, locked_at = NULL, lock_reason = NULL, updated_at = now()
       WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'payroll_locked'
       RETURNING id, employee_id`,
      [tenantId, summaryIds],
    );
    if (!rows.length) {
      throw new BadRequestException('No unlockable payroll-locked summaries found among the given IDs. Processed payroll is immutable.');
    }

    for (const row of rows) {
      await this.auditLog.log({
        tenantId, userId, entityType: 'attendance_summary', entityId: row.id,
        action: 'payroll_unlocked', newValues: { reason },
      });
    }

    return { unlocked: rows.length, employeeIds: rows.map((r: any) => r.employee_id) };
  }

  private _periodFor(year: number, month: number): { periodStart: string; periodEnd: string } {
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
    return { periodStart, periodEnd };
  }

  private _scopeClause(scope: SummaryScope, baseParams: any[]): { clause: string; params: any[] } {
    const params = [...baseParams];
    switch (scope.type) {
      case 'organization':
        return { clause: 'true', params };
      case 'branch':
        params.push(scope.branchId);
        return { clause: `branch_id = $${params.length}`, params };
      case 'department':
        params.push(scope.departmentId);
        return { clause: `department_id = $${params.length}`, params };
      case 'employees':
        params.push(scope.employeeIds ?? []);
        return { clause: `employee_id = ANY($${params.length}::uuid[])`, params };
      case 'employee':
        params.push(scope.employeeIds?.[0]);
        return { clause: `employee_id = $${params.length}`, params };
      default:
        return { clause: 'true', params };
    }
  }
}
