import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { BusinessDaysService } from './business-days.service';
import { OvertimeService } from './overtime.service';
import { SummaryScope } from '../../platform/services/payroll-lock.service';
import { Bucket, STATUS_BUCKET } from '../constants/attendance-status.constants';
import { AttendanceBehaviourEngineService } from './attendance-behaviour-engine.service';

export interface AttendanceSummaryRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  branch_id: string | null;
  department_id: string | null;
  period_start: string;
  period_end: string;
  total_working_days: number;
  business_working_days: number;
  present_days: number;
  half_day_count: number;
  absent_days: number;
  holiday_days: number;
  weekly_off_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  leave_days: number;
  payable_days: number;
  late_count: number;
  total_hours: number;
  overtime_hours: number;
  approved_ot_hours: number;
  status: string;
  payroll_locked: boolean;
  generation_version: number;
  generated_by: string | null;
  generated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approval_notes: string | null;
  rejection_reason: string | null;
  correction_notes: string | null;
  locked_by: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const COMPARABLE_FIELDS = [
  'business_working_days', 'present_days', 'half_day_count', 'absent_days',
  'holiday_days', 'weekly_off_days', 'paid_leave_days', 'unpaid_leave_days',
  'payable_days', 'late_count', 'approved_ot_hours',
] as const;

@Injectable()
export class AttendanceSummaryService {
  private readonly logger = new Logger(AttendanceSummaryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly businessDays: BusinessDaysService,
    private readonly overtimeService: OvertimeService,
    private readonly auditLog: AuditLogService,
    private readonly attendanceBehaviourEngine: AttendanceBehaviourEngineService,
  ) {}

  /**
   * Runs on the 1st of every month at 01:00 AM — auto-computes last month's
   * attendance org-wide for every tenant (unlocked summaries only).
   */
  @Cron('0 1 1 * *')
  async autoComputeLastMonth() {
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth();

    const { rows: tenants } = await this.db.query(`SELECT DISTINCT tenant_id FROM employees WHERE deleted_at IS NULL`);
    for (const { tenant_id } of tenants) {
      try {
        await this.compute(tenant_id, year, month, { type: 'organization' }, null);
      } catch (err: any) {
        this.logger.error(`[AutoCompute] Failed for tenant ${tenant_id}: ${err?.message}`);
      }
    }
  }

  /**
   * Compute/recompute summaries for the given scope and period. Skips any
   * employee whose existing summary is already payroll_locked/payroll_processed.
   */
  async compute(
    tenantId: string,
    year: number,
    month: number,
    scope: SummaryScope,
    userId: string | null,
  ): Promise<{ computed: number; skippedLocked: number; skippedNoStructureChange: number }> {
    const { periodStart, periodEnd } = this._periodFor(year, month);
    const employees = await this._resolveScopeEmployees(tenantId, scope);

    let computed = 0;
    let skippedLocked = 0;
    let skippedNoStructureChange = 0;

    for (const emp of employees) {
      const existing = await this._getExisting(tenantId, emp.id, periodStart, periodEnd);
      if (existing && ['payroll_locked', 'payroll_processed'].includes(existing.status)) {
        skippedLocked++;
        continue;
      }

      const figures = await this._computeFigures(tenantId, emp, periodStart, periodEnd, month, year);
      const changed = !existing || COMPARABLE_FIELDS.some((f) => Number(existing[f] ?? 0) !== Number((figures as any)[f] ?? 0));

      const nextVersion = existing ? (changed ? existing.generation_version + 1 : existing.generation_version) : 1;
      // A real change to the figures invalidates any prior review decision —
      // including an existing 'approved' status — and sends it back to the
      // review queue. An idempotent re-run with no diff leaves status alone.
      const nextStatus = changed ? 'pending_review' : (existing?.status ?? 'pending_review');

      const { rows } = await this.db.query(
        `INSERT INTO payroll_attendance_summary (
           tenant_id, employee_id, branch_id, department_id, period_start, period_end,
           total_working_days, business_working_days, present_days, half_day_count, absent_days,
           holiday_days, weekly_off_days, paid_leave_days, unpaid_leave_days, leave_days, payable_days,
           late_count, total_hours, overtime_hours, approved_ot_hours,
           status, generation_version, generated_by, generated_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6, $7,$8,$9,$10,$11, $12,$13,$14,$15,$16,$17, $18,$19,$20,$21,
           $22,$23,$24,now(),now()
         )
         ON CONFLICT (tenant_id, employee_id, period_start, period_end) DO UPDATE SET
           branch_id = EXCLUDED.branch_id, department_id = EXCLUDED.department_id,
           total_working_days = EXCLUDED.total_working_days,
           business_working_days = EXCLUDED.business_working_days,
           present_days = EXCLUDED.present_days, half_day_count = EXCLUDED.half_day_count,
           absent_days = EXCLUDED.absent_days, holiday_days = EXCLUDED.holiday_days,
           weekly_off_days = EXCLUDED.weekly_off_days, paid_leave_days = EXCLUDED.paid_leave_days,
           unpaid_leave_days = EXCLUDED.unpaid_leave_days, leave_days = EXCLUDED.leave_days,
           payable_days = EXCLUDED.payable_days, late_count = EXCLUDED.late_count,
           total_hours = EXCLUDED.total_hours, overtime_hours = EXCLUDED.overtime_hours,
           approved_ot_hours = EXCLUDED.approved_ot_hours,
           status = EXCLUDED.status, generation_version = EXCLUDED.generation_version,
           generated_by = EXCLUDED.generated_by, generated_at = now(), updated_at = now()
         RETURNING *`,
        [
          tenantId, emp.id, emp.branch_id ?? null, emp.department_id ?? null, periodStart, periodEnd,
          figures.calendarDays, figures.business_working_days, figures.present_days, figures.half_day_count, figures.absent_days,
          figures.holiday_days, figures.weekly_off_days, figures.paid_leave_days, figures.unpaid_leave_days,
          figures.paid_leave_days + figures.unpaid_leave_days, figures.payable_days,
          figures.late_count, figures.total_hours, figures.overtime_hours, figures.approved_ot_hours,
          nextStatus, nextVersion, userId,
        ],
      );

      if (changed) {
        await this._writeVersion(rows[0], userId, existing ? 'recompute' : 'initial_compute');
        computed++;
      } else {
        skippedNoStructureChange++;
      }
    }

    return { computed, skippedLocked, skippedNoStructureChange };
  }

  /** Explicit single-row recompute (always writes a version-history entry). */
  async recompute(tenantId: string, summaryId: string, userId: string): Promise<AttendanceSummaryRow> {
    const existing = await this._getById(tenantId, summaryId);
    if (['payroll_locked', 'payroll_processed'].includes(existing.status)) {
      throw new BadRequestException('Cannot recompute a locked or processed summary');
    }
    await this.compute(tenantId, this._yearOf(existing.period_start), this._monthOf(existing.period_start), {
      type: 'employee', employeeIds: [existing.employee_id],
    }, userId);
    const updated = await this._getById(tenantId, summaryId);
    await this._writeVersion(updated, userId, 'manual_recompute');
    return updated;
  }

  async approve(tenantId: string, summaryId: string, userId: string, notes?: string): Promise<AttendanceSummaryRow> {
    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'approved', reviewed_by = $3, reviewed_at = now(), approval_notes = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending_review'
       RETURNING *`,
      [summaryId, tenantId, userId, notes ?? null],
    );
    if (!rows.length) throw new NotFoundException('Summary not found or not awaiting review');
    await this.auditLog.log({
      tenantId, userId, entityType: 'attendance_summary', entityId: summaryId,
      action: 'attendance_summary_approved', newValues: { notes },
    });

    const summary = rows[0];
    try {
      await this.attendanceBehaviourEngine.onAttendanceSummaryApproved(
        tenantId, summary.employee_id, summary.period_start, summary.period_end,
      );
    } catch (err: any) {
      // Best-effort refresh of any open review cycle's attendance snapshot —
      // must never block the attendance summary approval itself.
      this.logger.error(`[AttendanceBehaviour] Failed to refresh snapshots after summary approval: ${err?.message}`);
    }

    return summary;
  }

  async reject(tenantId: string, summaryId: string, userId: string, reason: string): Promise<AttendanceSummaryRow> {
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');
    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'rejected', reviewed_by = $3, reviewed_at = now(), rejection_reason = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending_review'
       RETURNING *`,
      [summaryId, tenantId, userId, reason],
    );
    if (!rows.length) throw new NotFoundException('Summary not found or not awaiting review');
    await this.auditLog.log({
      tenantId, userId, entityType: 'attendance_summary', entityId: summaryId,
      action: 'attendance_summary_rejected', newValues: { reason },
    });
    return rows[0];
  }

  async requestCorrection(tenantId: string, summaryId: string, userId: string, notes: string): Promise<AttendanceSummaryRow> {
    if (!notes?.trim()) throw new BadRequestException('Correction notes are required');
    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'draft', reviewed_by = $3, reviewed_at = now(), correction_notes = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status IN ('pending_review', 'rejected')
       RETURNING *`,
      [summaryId, tenantId, userId, notes],
    );
    if (!rows.length) throw new NotFoundException('Summary not found or not eligible for correction');
    await this.auditLog.log({
      tenantId, userId, entityType: 'attendance_summary', entityId: summaryId,
      action: 'attendance_correction_requested', newValues: { notes },
    });
    return rows[0];
  }

  async cancel(tenantId: string, summaryId: string, userId: string, reason: string): Promise<AttendanceSummaryRow> {
    if (!reason?.trim()) throw new BadRequestException('A cancellation reason is required');
    const { rows } = await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'cancelled', reviewed_by = $3, reviewed_at = now(), rejection_reason = $4, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('payroll_locked', 'payroll_processed')
       RETURNING *`,
      [summaryId, tenantId, userId, reason],
    );
    if (!rows.length) throw new NotFoundException('Summary not found or already locked/processed');
    await this.auditLog.log({
      tenantId, userId, entityType: 'attendance_summary', entityId: summaryId,
      action: 'attendance_summary_cancelled', newValues: { reason },
    });
    return rows[0];
  }

  async listSummaries(tenantId: string, year: number, month: number, filters: {
    branch_id?: string; department_id?: string; employee_id?: string; status?: string;
    leave_type?: string; attendance_state?: string; search?: string;
  } = {}): Promise<AttendanceSummaryRow[]> {
    const { periodStart, periodEnd } = this._periodFor(year, month);
    const params: any[] = [tenantId, periodStart, periodEnd];
    let where = 's.tenant_id = $1 AND s.period_start = $2 AND s.period_end = $3';

    if (filters.branch_id) { params.push(filters.branch_id); where += ` AND s.branch_id = $${params.length}`; }
    if (filters.department_id) { params.push(filters.department_id); where += ` AND s.department_id = $${params.length}`; }
    if (filters.employee_id) { params.push(filters.employee_id); where += ` AND s.employee_id = $${params.length}`; }
    if (filters.status) { params.push(filters.status); where += ` AND s.status = $${params.length}`; }
    if (filters.search) { params.push(`%${filters.search}%`); where += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`; }
    if (filters.attendance_state) {
      const col = ({
        present: 'present_days', late: 'late_count', half_day: 'half_day_count', absent: 'absent_days',
        holiday: 'holiday_days', weekly_off: 'weekly_off_days', paid_leave: 'paid_leave_days', unpaid_leave: 'unpaid_leave_days',
      } as Record<string, string>)[filters.attendance_state];
      if (col) where += ` AND s.${col} > 0`;
    }
    if (filters.leave_type) {
      params.push(filters.leave_type);
      where += ` AND EXISTS (
        SELECT 1 FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.tenant_id = s.tenant_id AND lr.employee_id = s.employee_id AND lr.status = 'approved'
          AND lr.start_date <= s.period_end AND lr.end_date >= s.period_start
          AND (lt.code = $${params.length} OR lt.name = $${params.length})
      )`;
    }

    const { rows } = await this.db.query(
      `SELECT s.*, e.first_name, e.last_name, e.employee_code, b.name AS branch_name, d.name AS department_name
       FROM payroll_attendance_summary s
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN branches b ON s.branch_id = b.id
       LEFT JOIN departments d ON s.department_id = d.id
       WHERE ${where}
       ORDER BY e.first_name, e.last_name`,
      params,
    );
    return rows;
  }

  async getKpis(tenantId: string, year: number, month: number, filters: { branch_id?: string; department_id?: string } = {}) {
    const { periodStart, periodEnd } = this._periodFor(year, month);
    const params: any[] = [tenantId, periodStart, periodEnd];
    let where = 'tenant_id = $1 AND period_start = $2 AND period_end = $3';
    if (filters.branch_id) { params.push(filters.branch_id); where += ` AND branch_id = $${params.length}`; }
    if (filters.department_id) { params.push(filters.department_id); where += ` AND department_id = $${params.length}`; }

    const { rows: statusRows } = await this.db.query(
      `SELECT status, COUNT(*) AS count FROM payroll_attendance_summary WHERE ${where} GROUP BY status`,
      params,
    );
    const { rows: aggRows } = await this.db.query(
      `SELECT
         AVG(CASE WHEN business_working_days > 0 THEN payable_days::float / business_working_days * 100 END) AS avg_attendance_pct,
         AVG(approved_ot_hours) AS avg_ot_hours,
         AVG(paid_leave_days + unpaid_leave_days) AS avg_leave_days,
         AVG(late_count) AS avg_late_days,
         AVG(CASE WHEN business_working_days > 0 THEN (business_working_days - absent_days)::float / business_working_days * 100 END) AS compliance_pct
       FROM payroll_attendance_summary WHERE ${where}`,
      params,
    );

    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = parseInt(r.count, 10);
    const agg = aggRows[0] ?? {};

    return {
      pendingReview: byStatus['pending_review'] ?? 0,
      approved: byStatus['approved'] ?? 0,
      payrollLocked: byStatus['payroll_locked'] ?? 0,
      payrollProcessed: byStatus['payroll_processed'] ?? 0,
      rejected: byStatus['rejected'] ?? 0,
      draft: byStatus['draft'] ?? 0,
      avgAttendancePct: parseFloat(agg.avg_attendance_pct ?? 0),
      avgOtHours: parseFloat(agg.avg_ot_hours ?? 0),
      avgLeaveDays: parseFloat(agg.avg_leave_days ?? 0),
      avgLateDays: parseFloat(agg.avg_late_days ?? 0),
      compliancePct: parseFloat(agg.compliance_pct ?? 0),
    };
  }

  async getVersions(tenantId: string, summaryId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM payroll_attendance_summary_versions
       WHERE tenant_id = $1 AND summary_id = $2 ORDER BY generation_version DESC`,
      [tenantId, summaryId],
    );
    return rows;
  }

  // ── Private: scope + figures ────────────────────────────────────────────────

  private async _resolveScopeEmployees(tenantId: string, scope: SummaryScope): Promise<{ id: string; branch_id: string | null; department_id: string | null }[]> {
    const params: any[] = [tenantId, 'active', 'confirmed', 'probation'];
    let where = 'tenant_id = $1 AND status IN ($2, $3, $4) AND deleted_at IS NULL';

    switch (scope.type) {
      case 'branch':
        params.push(scope.branchId); where += ` AND branch_id = $${params.length}`; break;
      case 'department':
        params.push(scope.departmentId); where += ` AND department_id = $${params.length}`; break;
      case 'employees':
        params.push(scope.employeeIds ?? []); where += ` AND id = ANY($${params.length}::uuid[])`; break;
      case 'employee':
        params.push(scope.employeeIds?.[0]); where += ` AND id = $${params.length}`; break;
    }

    const { rows } = await this.db.query(
      `SELECT id, branch_id, department_id FROM employees WHERE ${where}`,
      params,
    );
    return rows;
  }

  private async _computeFigures(
    tenantId: string,
    emp: { id: string; branch_id: string | null },
    periodStart: string,
    periodEnd: string,
    month: number,
    year: number,
  ) {
    const classification = await this.businessDays.classifyPeriod(tenantId, emp.branch_id, periodStart, periodEnd);

    const { rows: attRows } = await this.db.query(
      `SELECT date, status, late_minutes,
         EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0 AS hours
       FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4`,
      [tenantId, emp.id, periodStart, periodEnd],
    );
    const attByDate = new Map<string, any>(attRows.map((r: any) => [this._iso(r.date), r]));

    const { rows: leaveRows } = await this.db.query(
      `SELECT lr.start_date, lr.end_date, lt.paid
       FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.tenant_id = $1 AND lr.employee_id = $2 AND lr.status = 'approved'
         AND lr.start_date <= $4 AND lr.end_date >= $3`,
      [tenantId, emp.id, periodStart, periodEnd],
    );
    const leaveByDate = new Map<string, boolean>(); // date -> paid?
    for (const lr of leaveRows) {
      const from = new Date(Math.max(new Date(`${this._iso(lr.start_date)}T00:00:00Z`).getTime(), new Date(`${periodStart}T00:00:00Z`).getTime()));
      const to = new Date(Math.min(new Date(`${this._iso(lr.end_date)}T00:00:00Z`).getTime(), new Date(`${periodEnd}T00:00:00Z`).getTime()));
      for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        leaveByDate.set(d.toISOString().split('T')[0], !!lr.paid);
      }
    }

    let presentDays = 0, halfDayCount = 0, absentDays = 0, holidayDays = 0, weeklyOffDays = 0;
    let paidLeaveDays = 0, unpaidLeaveDays = 0, lateCount = 0, totalHours = 0, overtimeHours = 0;

    for (const [date, dayClass] of classification.entries()) {
      const att = attByDate.get(date);
      let bucket: Bucket;

      if (att) {
        bucket = STATUS_BUCKET[att.status] ?? 'absent';
      } else if (dayClass === 'holiday') {
        bucket = 'holiday';
      } else if (dayClass === 'weekly_off') {
        bucket = 'weekly_off';
      } else if (leaveByDate.has(date)) {
        bucket = leaveByDate.get(date) ? 'paid_leave' : 'unpaid_leave';
      } else {
        bucket = 'absent';
      }

      if (att?.late_minutes > 0 && (bucket === 'present' || bucket === 'half_day')) lateCount++;
      if (att?.hours) totalHours += parseFloat(att.hours);

      switch (bucket) {
        case 'present': presentDays++; break;
        case 'half_day': halfDayCount++; break;
        case 'absent': absentDays++; break;
        case 'holiday': holidayDays++; break;
        case 'weekly_off': weeklyOffDays++; break;
        case 'paid_leave': paidLeaveDays++; break;
        case 'unpaid_leave': unpaidLeaveDays++; break;
      }
    }

    const { rows: otRows } = await this.db.query(
      `SELECT COALESCE(SUM(overtime_minutes), 0) / 60.0 AS ot_hours
       FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4`,
      [tenantId, emp.id, periodStart, periodEnd],
    );
    overtimeHours = parseFloat(otRows[0]?.ot_hours ?? 0);

    const businessWorkingDays = [...classification.values()].filter((v) => v === 'business').length;
    const payableDays = presentDays + 0.5 * halfDayCount + paidLeaveDays + holidayDays + weeklyOffDays;

    const otResult = await this.overtimeService.getApprovedOtForPayroll(tenantId, emp.id, month, year);

    return {
      calendarDays: classification.size,
      business_working_days: businessWorkingDays,
      present_days: presentDays,
      half_day_count: halfDayCount,
      absent_days: absentDays,
      holiday_days: holidayDays,
      weekly_off_days: weeklyOffDays,
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
      payable_days: payableDays,
      late_count: lateCount,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      approved_ot_hours: otResult.eligible ? otResult.approvedHours : 0,
    };
  }

  private async _writeVersion(row: AttendanceSummaryRow, userId: string | null, reason: string) {
    await this.db.query(
      `INSERT INTO payroll_attendance_summary_versions
         (summary_id, tenant_id, employee_id, period_start, period_end, generation_version, snapshot, generated_by, generated_at, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,now(),$9)`,
      [row.id, row.tenant_id, row.employee_id, row.period_start, row.period_end, row.generation_version, JSON.stringify(row), userId, reason],
    );
  }

  private async _getExisting(tenantId: string, employeeId: string, periodStart: string, periodEnd: string): Promise<AttendanceSummaryRow | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM payroll_attendance_summary WHERE tenant_id = $1 AND employee_id = $2 AND period_start = $3 AND period_end = $4`,
      [tenantId, employeeId, periodStart, periodEnd],
    );
    return rows[0] ?? null;
  }

  private async _getById(tenantId: string, id: string): Promise<AttendanceSummaryRow> {
    const { rows } = await this.db.query(`SELECT * FROM payroll_attendance_summary WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!rows.length) throw new NotFoundException('Attendance summary not found');
    return rows[0];
  }

  private _periodFor(year: number, month: number): { periodStart: string; periodEnd: string } {
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
    return { periodStart, periodEnd };
  }

  private _yearOf(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCFullYear(); }
  private _monthOf(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCMonth() + 1; }

  private _iso(value: string | Date): string {
    return value instanceof Date ? value.toISOString().split('T')[0] : String(value).split('T')[0];
  }
}
