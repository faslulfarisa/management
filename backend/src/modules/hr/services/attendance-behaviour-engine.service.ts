import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { BusinessDaysService } from './business-days.service';
import { OvertimeService } from './overtime.service';
import { AttendanceBehaviourConfigService } from './attendance-behaviour-config.service';
import { Bucket, STATUS_BUCKET } from '../constants/attendance-status.constants';
import { AttendanceBehaviourConfig } from '../types/attendance-behaviour-config.types';

export interface AttendanceBehaviourMetrics {
  businessWorkingDays: number;
  presentDays: number;
  halfDayCount: number;
  lateCount: number;
  unapprovedAbsenceDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  approvedOtHours: number;
  otEligible: boolean;
  correctionsCount: number;
}

export interface AttendanceBehaviourScoreResult {
  attendancePercentage: number;
  attendanceCompliancePercentage: number;
  componentScores: Record<string, number>;
  behaviourScore: number;
  behaviourRating: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number): number => Math.max(0, Math.min(100, n));

@Injectable()
export class AttendanceBehaviourEngineService {
  constructor(
    private readonly db: DatabaseService,
    private readonly businessDays: BusinessDaysService,
    private readonly overtimeService: OvertimeService,
    private readonly configService: AttendanceBehaviourConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Computes raw attendance metrics for one employee over an arbitrary date range. */
  async computeMetrics(
    tenantId: string,
    employeeId: string,
    branchId: string | null,
    periodStart: string,
    periodEnd: string,
  ): Promise<AttendanceBehaviourMetrics> {
    const classification = await this.businessDays.classifyPeriod(tenantId, branchId, periodStart, periodEnd);

    const { rows: attRows } = await this.db.query(
      `SELECT date, status, late_minutes FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date BETWEEN $3 AND $4`,
      [tenantId, employeeId, periodStart, periodEnd],
    );
    const attByDate = new Map<string, any>(attRows.map((r: any) => [this._iso(r.date), r]));

    const { rows: leaveRows } = await this.db.query(
      `SELECT lr.start_date, lr.end_date, lt.paid
       FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.tenant_id = $1 AND lr.employee_id = $2 AND lr.status = 'approved'
         AND lr.start_date <= $4 AND lr.end_date >= $3`,
      [tenantId, employeeId, periodStart, periodEnd],
    );
    const leaveByDate = new Map<string, boolean>();
    for (const lr of leaveRows) {
      const from = new Date(Math.max(
        new Date(`${this._iso(lr.start_date)}T00:00:00Z`).getTime(),
        new Date(`${periodStart}T00:00:00Z`).getTime(),
      ));
      const to = new Date(Math.min(
        new Date(`${this._iso(lr.end_date)}T00:00:00Z`).getTime(),
        new Date(`${periodEnd}T00:00:00Z`).getTime(),
      ));
      for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        leaveByDate.set(d.toISOString().split('T')[0], !!lr.paid);
      }
    }

    let presentDays = 0, halfDayCount = 0, unapprovedAbsenceDays = 0;
    let paidLeaveDays = 0, unpaidLeaveDays = 0, lateCount = 0;

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

      switch (bucket) {
        case 'present': presentDays++; break;
        case 'half_day': halfDayCount++; break;
        case 'absent': unapprovedAbsenceDays++; break;
        case 'paid_leave': paidLeaveDays++; break;
        case 'unpaid_leave': unpaidLeaveDays++; break;
      }
    }

    const businessWorkingDays = [...classification.values()].filter((v) => v === 'business').length;

    let approvedOtHours = 0;
    let otEligible = false;
    for (const { month, year } of this._monthsInRange(periodStart, periodEnd)) {
      const ot = await this.overtimeService.getApprovedOtForPayroll(tenantId, employeeId, month, year);
      if (ot.eligible) {
        otEligible = true;
        approvedOtHours += ot.approvedHours;
      }
    }

    const { rows: correctionRows } = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM attendance_corrections
       WHERE tenant_id = $1 AND employee_id = $2 AND requested_at::date BETWEEN $3 AND $4`,
      [tenantId, employeeId, periodStart, periodEnd],
    );

    return {
      businessWorkingDays, presentDays, halfDayCount, lateCount, unapprovedAbsenceDays,
      paidLeaveDays, unpaidLeaveDays, approvedOtHours, otEligible,
      correctionsCount: correctionRows[0]?.count ?? 0,
    };
  }

  /** Pure scoring formula — see docs/PERFORMANCE_ATTENDANCE_ENGINE_REPORT.md. */
  scoreMetrics(metrics: AttendanceBehaviourMetrics, config: AttendanceBehaviourConfig): AttendanceBehaviourScoreResult {
    const bwd = Math.max(metrics.businessWorkingDays, 0);

    const attendancePercentage = bwd > 0
      ? clamp((metrics.presentDays + 0.5 * metrics.halfDayCount + metrics.paidLeaveDays) / bwd * 100)
      : 100;
    const attendanceCompliancePercentage = bwd > 0
      ? clamp((bwd - metrics.unapprovedAbsenceDays) / bwd * 100)
      : 100;

    const punctuality = clamp(100 - Math.max(0, metrics.lateCount - config.lateGraceThreshold) * config.latePenaltyPoints);
    const consistency = bwd > 0
      ? clamp(100 - (metrics.lateCount + metrics.halfDayCount + metrics.unapprovedAbsenceDays) / bwd * 100 * config.consistencyPenaltyMultiplier)
      : 100;
    const halfDayBehaviour = clamp(100 - metrics.halfDayCount * config.halfDayPenaltyPoints);
    const unapprovedAbsence = clamp(100 - metrics.unapprovedAbsenceDays * config.unapprovedAbsencePenaltyPoints);
    const approvedOvertime = !metrics.otEligible
      ? (config.otNeutralWhenIneligible ? 100 : 0)
      : clamp(Math.min(metrics.approvedOtHours, config.otCapHours) / Math.max(config.otCapHours, 0.01) * 100);
    const attendanceCorrections = clamp(100 - Math.max(0, metrics.correctionsCount - config.correctionGraceCount) * config.correctionPenaltyPoints);

    const componentScores = {
      attendancePercentage, punctuality, consistency, halfDayBehaviour,
      unapprovedAbsence, approvedOvertime, attendanceCorrections,
    };

    const weights = config.weights;
    const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const behaviourScore = clamp(
      (componentScores.attendancePercentage * weights.attendancePercentage
        + componentScores.punctuality * weights.punctuality
        + componentScores.consistency * weights.consistency
        + componentScores.halfDayBehaviour * weights.halfDayBehaviour
        + componentScores.unapprovedAbsence * weights.unapprovedAbsence
        + componentScores.approvedOvertime * weights.approvedOvertime
        + componentScores.attendanceCorrections * weights.attendanceCorrections) / weightSum,
    );

    return {
      attendancePercentage: round2(attendancePercentage),
      attendanceCompliancePercentage: round2(attendanceCompliancePercentage),
      componentScores: Object.fromEntries(Object.entries(componentScores).map(([k, v]) => [k, round2(v)])),
      behaviourScore: round2(behaviourScore),
      behaviourRating: AttendanceBehaviourConfigService.resolveRating(round2(behaviourScore), config.ratingBuckets),
    };
  }

  /** Generates (or regenerates, pre-freeze) the snapshot for one employee in one cycle. */
  async generateSnapshot(tenantId: string, cycleId: string, employeeId: string, userId: string | null) {
    const cycle = await this._getCycle(tenantId, cycleId);
    const employee = await this._getEmployee(tenantId, employeeId);
    const existing = await this._getSnapshot(tenantId, cycleId, employeeId);
    if (existing?.status === 'frozen') {
      throw new ForbiddenException('Attendance behaviour score is frozen for this review cycle and cannot be regenerated');
    }

    const configRow = await this.configService.getConfig(tenantId);
    const metrics = await this.computeMetrics(tenantId, employeeId, employee.branch_id, cycle.start_date, cycle.end_date);
    const score = this.scoreMetrics(metrics, configRow.config);

    const nextVersion = existing ? existing.generation_version + 1 : 1;
    const status = existing ? 'recalculated' : 'calculated';

    const { rows } = await this.db.query(
      `INSERT INTO attendance_performance_snapshots (
         tenant_id, employee_id, cycle_id, period_start, period_end,
         business_working_days, present_days, half_day_count, late_count, unapproved_absence_days,
         paid_leave_days, unpaid_leave_days, approved_ot_hours, corrections_count,
         attendance_percentage, attendance_compliance_percentage, component_scores, behaviour_score, behaviour_rating,
         status, generation_version, config_version, generated_by, generated_at
       ) VALUES (
         $1,$2,$3,$4,$5, $6,$7,$8,$9,$10, $11,$12,$13,$14, $15,$16,$17::jsonb,$18,$19, $20,$21,$22,$23,now()
       )
       ON CONFLICT (tenant_id, employee_id, cycle_id) DO UPDATE SET
         period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
         business_working_days = EXCLUDED.business_working_days, present_days = EXCLUDED.present_days,
         half_day_count = EXCLUDED.half_day_count, late_count = EXCLUDED.late_count,
         unapproved_absence_days = EXCLUDED.unapproved_absence_days, paid_leave_days = EXCLUDED.paid_leave_days,
         unpaid_leave_days = EXCLUDED.unpaid_leave_days, approved_ot_hours = EXCLUDED.approved_ot_hours,
         corrections_count = EXCLUDED.corrections_count, attendance_percentage = EXCLUDED.attendance_percentage,
         attendance_compliance_percentage = EXCLUDED.attendance_compliance_percentage,
         component_scores = EXCLUDED.component_scores, behaviour_score = EXCLUDED.behaviour_score,
         behaviour_rating = EXCLUDED.behaviour_rating, status = EXCLUDED.status,
         generation_version = EXCLUDED.generation_version, config_version = EXCLUDED.config_version,
         generated_by = EXCLUDED.generated_by, generated_at = now(), updated_at = now()
       RETURNING *`,
      [
        tenantId, employeeId, cycleId, cycle.start_date, cycle.end_date,
        metrics.businessWorkingDays, metrics.presentDays, metrics.halfDayCount, metrics.lateCount, metrics.unapprovedAbsenceDays,
        metrics.paidLeaveDays, metrics.unpaidLeaveDays, metrics.approvedOtHours, metrics.correctionsCount,
        score.attendancePercentage, score.attendanceCompliancePercentage, JSON.stringify(score.componentScores),
        score.behaviourScore, score.behaviourRating,
        status, nextVersion, configRow.version, userId,
      ],
    );

    await this.auditLog.log({
      tenantId, userId,
      entityType: 'attendance_performance_snapshot', entityId: rows[0].id,
      action: existing ? 'score_recalculated' : 'score_generated',
      oldValues: existing ? { behaviour_score: existing.behaviour_score, component_scores: existing.component_scores } : null,
      newValues: { behaviour_score: score.behaviourScore, component_scores: score.componentScores },
    });

    return rows[0];
  }

  /** Explicit recalculation — blocked once the cycle is approved/locked or the snapshot is frozen. */
  async recalculateSnapshot(tenantId: string, cycleId: string, employeeId: string, userId: string | null) {
    const cycle = await this._getCycle(tenantId, cycleId);
    if (['approved', 'locked'].includes(cycle.status)) {
      throw new ForbiddenException('Cannot recalculate attendance for a cycle that is already approved or locked');
    }
    return this.generateSnapshot(tenantId, cycleId, employeeId, userId);
  }

  /** Bulk-generates snapshots for every active employee — called when a cycle goes active. */
  async generateForCycle(tenantId: string, cycleId: string, userId: string | null): Promise<{ generated: number; failed: number }> {
    const { rows: employees } = await this.db.query(
      `SELECT id FROM employees WHERE tenant_id = $1 AND status IN ('active', 'confirmed', 'probation') AND deleted_at IS NULL`,
      [tenantId],
    );

    let generated = 0;
    let failed = 0;
    for (const emp of employees) {
      try {
        await this.generateSnapshot(tenantId, cycleId, emp.id, userId);
        generated++;
      } catch {
        failed++;
      }
    }

    await this.db.query(
      `UPDATE review_cycles SET attendance_last_calculated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [cycleId, tenantId],
    );

    return { generated, failed };
  }

  /** Bulk recalculation across every employee in a cycle — used by the "recalculate" admin action. */
  async recalculateForCycle(tenantId: string, cycleId: string, userId: string | null): Promise<{ generated: number; failed: number }> {
    const cycle = await this._getCycle(tenantId, cycleId);
    if (['approved', 'locked'].includes(cycle.status)) {
      throw new ForbiddenException('Cannot recalculate attendance for a cycle that is already approved or locked');
    }
    return this.generateForCycle(tenantId, cycleId, userId);
  }

  /** Freezes every snapshot in a cycle — called when the cycle is approved or locked. */
  async freezeSnapshots(tenantId: string, cycleId: string, userId: string | null): Promise<number> {
    const { rows } = await this.db.query(
      `UPDATE attendance_performance_snapshots
       SET status = 'frozen', frozen_by = $3, frozen_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND cycle_id = $2 AND status != 'frozen'
       RETURNING id`,
      [tenantId, cycleId, userId],
    );
    if (rows.length) {
      await this.auditLog.log({
        tenantId, userId,
        entityType: 'attendance_performance_snapshot', entityId: cycleId,
        action: 'snapshots_frozen', newValues: { count: rows.length },
      });
    }
    return rows.length;
  }

  /**
   * Refresh hook: when a payroll attendance summary is approved, refresh
   * any attendance behaviour snapshot for that employee whose review cycle
   * overlaps the approved period and isn't approved/locked/frozen yet.
   */
  async onAttendanceSummaryApproved(tenantId: string, employeeId: string, periodStart: string, periodEnd: string): Promise<void> {
    const { rows: cycles } = await this.db.query(
      `SELECT id, status FROM review_cycles
       WHERE tenant_id = $1 AND status = 'active' AND start_date <= $3 AND end_date >= $2`,
      [tenantId, periodStart, periodEnd],
    );

    for (const cycle of cycles) {
      const existing = await this._getSnapshot(tenantId, cycle.id, employeeId);
      if (!existing || existing.status === 'frozen') continue;
      try {
        await this.generateSnapshot(tenantId, cycle.id, employeeId, null);
      } catch {
        // Best-effort refresh — a failure here must never block attendance approval.
      }
    }
  }

  private async _getCycle(tenantId: string, cycleId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM review_cycles WHERE id = $1 AND tenant_id = $2`,
      [cycleId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Review cycle not found');
    return rows[0];
  }

  private async _getEmployee(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT id, branch_id FROM employees WHERE id = $1 AND tenant_id = $2`,
      [employeeId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found');
    return rows[0];
  }

  private async _getSnapshot(tenantId: string, cycleId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM attendance_performance_snapshots WHERE tenant_id = $1 AND cycle_id = $2 AND employee_id = $3`,
      [tenantId, cycleId, employeeId],
    );
    return rows[0] ?? null;
  }

  private _monthsInRange(periodStart: string, periodEnd: string): { month: number; year: number }[] {
    const months: { month: number; year: number }[] = [];
    const start = new Date(`${periodStart}T00:00:00Z`);
    const end = new Date(`${periodEnd}T00:00:00Z`);
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= last) {
      months.push({ month: cursor.getUTCMonth() + 1, year: cursor.getUTCFullYear() });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return months;
  }

  private _iso(value: string | Date): string {
    return value instanceof Date ? value.toISOString().split('T')[0] : String(value).split('T')[0];
  }
}
