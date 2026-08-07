import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';
import { HistoricalAttendanceDependencyRebuildService } from './historical-attendance-dependency-rebuild.service';
import {
  CommitAttendanceRebuildDto,
  CreateAttendanceRebuildSummaryDto,
} from '../dto/historical-attendance-import.dto';

interface Actor {
  sub: string;
}

interface AcceptedPunchRow {
  staging_row_id: string;
  reconciliation_id: string;
  reconciliation_action: 'create' | 'update' | 'unchanged';
  attendance_impact: 'create' | 'update' | 'unchanged' | 'none';
  mapped_employee_id: string;
  punched_at: Date | string;
  punch_direction: string | null;
  device_identifier: string | null;
  raw_employee_identifier: string | null;
  canonical_punch: Record<string, any>;
  raw_payload: Record<string, any>;
  source_type: string | null;
  source_name: string | null;
  employee_code: string;
  branch_id: string | null;
  department_id: string | null;
  existing_attendance_record_id: string | null;
  linked_attendance_record_id: string | null;
}

interface ShiftRow {
  shift_id: string;
  start_time: string;
  end_time: string;
  grace_period_minutes: string | number;
  is_overnight: boolean;
}

interface ExistingAttendance {
  id: string;
  employee_id: string;
  date: Date | string;
  clock_in: Date | string | null;
  clock_out: Date | string | null;
  status: string | null;
  shift_id: string | null;
  late_minutes: number | null;
  overtime_minutes: number | null;
  early_departure_minutes: number | null;
  provider_name: string | null;
  source_device_id: string | null;
  punch_sequence: any[] | null;
  punch_count: number | null;
  branch_id: string | null;
  remarks: string | null;
  total_break_minutes: number | null;
  unpaid_break_minutes: number | null;
  total_overdue_break_minutes: number | null;
}

interface ResolvedPunch extends AcceptedPunchRow {
  punchTime: Date;
  attendanceDate: string;
  shift: ShiftRow | null;
}

interface BreakPair {
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  isPaid: boolean;
  stagingRowIds: string[];
}

interface AttendancePlan {
  key: string;
  employeeId: string;
  employeeCode: string;
  branchId: string | null;
  departmentId: string | null;
  date: string;
  shift: ShiftRow | null;
  existing: ExistingAttendance | null;
  punches: ResolvedPunch[];
  proposed: {
    clockIn: Date | null;
    clockOut: Date | null;
    status: string;
    lateMinutes: number;
    earlyDepartureMinutes: number;
    overtimeMinutes: number;
    shiftId: string | null;
    isOvernight: boolean;
    remarks: string;
    sourceDeviceId: string | null;
    punchSequence: any[];
    punchCountDelta: number;
    breakPairs: BreakPair[];
    totalBreakMinutesDelta: number;
    unpaidBreakMinutesDelta: number;
  };
  operation: 'create' | 'update' | 'unchanged';
  warnings: string[];
  blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  context: {
    dayClassification: 'business' | 'holiday' | 'weekly_off';
    leaveOverlap: boolean;
    missingPunch: boolean;
    multiplePunches: boolean;
    nightShift: boolean;
    noShift: boolean;
  };
}

@Injectable()
export class HistoricalAttendanceRebuildService {
  constructor(
    private readonly db: DatabaseService,
    private readonly payrollLock: PayrollLockService,
    private readonly dependencyRebuildService: HistoricalAttendanceDependencyRebuildService,
  ) {}

  async createSummary(
    tenantId: string,
    actor: Actor,
    batchId: string,
    body: CreateAttendanceRebuildSummaryDto = {},
  ) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const planResult = await this.buildPlan(tenantId, batchId, body);

    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_rebuild_runs
         (tenant_id, batch_id, status, summary, blockers, warnings, created_by)
       VALUES ($1, $2, 'summary', $3, $4, $5, $6)
       RETURNING *`,
      [
        tenantId,
        batchId,
        JSON.stringify(planResult.summary),
        JSON.stringify(planResult.blockers),
        JSON.stringify(planResult.warnings),
        actor.sub,
      ],
    );

    await this.log(tenantId, batchId, batch.source_id, 'info', 'attendance_rebuild_summary_created', actor.sub, {
      rebuildRunId: rows[0].id,
      ...planResult.summary,
    });

    return {
      id: rows[0].id,
      status: rows[0].status,
      summary: planResult.summary,
      blockers: planResult.blockers,
      warnings: planResult.warnings,
      plans: planResult.plans.map((plan) => this.serializePlan(plan)),
    };
  }

  async commit(tenantId: string, actor: Actor, batchId: string, body: CommitAttendanceRebuildDto) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const run = await this.getSummaryRun(tenantId, batchId, body.summaryRunId);
    if (run.status !== 'summary') {
      throw new BadRequestException('Only a summary rebuild run can be committed');
    }

    const planResult = await this.buildPlan(tenantId, batchId, {});
    if (planResult.blockers.length > 0) {
      await this.markRunFailed(tenantId, run.id, 'Rebuild summary has blockers');
      throw new BadRequestException({
        message: 'Attendance rebuild cannot be committed while blockers exist',
        blockers: planResult.blockers,
      });
    }

    if (planResult.summary.acceptedPunches === 0 && planResult.summary.alreadyAppliedPunches === 0) {
      throw new BadRequestException('No accepted reconciliation punches are available to commit');
    }

    for (const plan of planResult.plans) {
      await this.payrollLock.assertPeriodUnlocked(tenantId, plan.employeeId, plan.date);
    }

    const commitStartedAt = Date.now();
    const commitResult = await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE historical_attendance_import_rebuild_runs
         SET status = 'committing', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [run.id, tenantId],
      );

      const importCommit = await this.createImportCommitWithClient(client, {
        tenantId,
        batchId,
        rebuildRunId: run.id,
        sourceId: batch.source_id,
        actorUserId: actor.sub,
        summary: planResult.summary,
        metadata: {
          dateFrom: batch.date_from,
          dateTo: batch.date_to,
          sourceId: batch.source_id,
          acceptedPunches: planResult.summary.acceptedPunches,
          pendingPunches: planResult.summary.pendingPunches,
        },
      });

      await this.snapshotAffectedSummariesWithClient(client, tenantId, batchId, run.id, importCommit.id, planResult.plans);

      let recordsCreated = 0;
      let recordsUpdated = 0;
      let punchesLinked = 0;
      let breakSessionsCreated = 0;

      for (const plan of planResult.plans) {
        if (plan.operation === 'unchanged') continue;
        const before = plan.existing ? { ...plan.existing } : null;
        const attendanceSnapshotKey = this.attendanceSnapshotKey(plan);
        await this.snapshotAttendancePlanWithClient(client, tenantId, batchId, run.id, importCommit.id, plan);
        const attendanceRecord = await this.upsertAttendance(client, tenantId, plan);
        const attendanceRecordId = attendanceRecord.id;
        await this.updateSnapshotCurrentWithClient(
          client,
          tenantId,
          importCommit.id,
          'attendance_record',
          attendanceSnapshotKey,
          attendanceRecordId,
          attendanceRecord as unknown as Record<string, unknown>,
        );

        if (plan.operation === 'create') recordsCreated++;
        if (plan.operation === 'update') recordsUpdated++;

        const breakSessions = await this.insertBreakSessions(client, tenantId, attendanceRecordId, plan);
        breakSessionsCreated += breakSessions.length;

        for (const punch of plan.punches) {
          const inserted = await client.query(
            `INSERT INTO historical_attendance_import_attendance_links
               (tenant_id, batch_id, rebuild_run_id, commit_id, staging_row_id, attendance_record_id, applied_action)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (staging_row_id) DO NOTHING
             RETURNING id`,
            [tenantId, batchId, run.id, importCommit.id, punch.staging_row_id, attendanceRecordId, plan.operation],
          );
          if (inserted.rows.length) punchesLinked++;

          await this.writeAttendanceAuditWithClient(client, {
            tenantId,
            employeeId: plan.employeeId,
            attendanceRecordId,
            eventType: 'punch_received',
            actorType: 'provider',
            actorId: punch.source_name ?? punch.source_type ?? 'historical_import',
            afterState: {
              date: plan.date,
              punch_time: punch.punchTime.toISOString(),
              punch_type: punch.punch_direction ?? 'unknown',
            },
            metadata: {
              source: 'historical_attendance_import',
              batchId,
              rebuildRunId: run.id,
              importCommitId: importCommit.id,
              stagingRowId: punch.staging_row_id,
              device: punch.device_identifier,
            },
          });
        }

        await this.writeAttendanceAuditWithClient(client, {
          tenantId,
          employeeId: plan.employeeId,
          attendanceRecordId,
          eventType: plan.operation === 'create' ? 'record_created' : 'record_updated',
          actorType: 'system',
          actorId: actor.sub,
          beforeState: before,
          afterState: attendanceRecord,
          metadata: {
            source: 'historical_attendance_import',
            batchId,
            rebuildRunId: run.id,
            importCommitId: importCommit.id,
            operation: plan.operation,
          },
        });
      }

      const summary = {
        ...planResult.summary,
        recordsCreated,
        recordsUpdated,
        punchesLinked,
        breakSessionsCreated,
      };

      await client.query(
        `UPDATE historical_attendance_import_rebuild_runs
         SET status = 'committed',
             summary = $3,
             blockers = '[]'::jsonb,
             warnings = $4,
             committed_by = $5,
             committed_at = now(),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [run.id, tenantId, JSON.stringify(summary), JSON.stringify(planResult.warnings), actor.sub],
      );

      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = 'completed',
             completed_at = COALESCE(completed_at, now()),
             statistics = COALESCE(statistics, '{}'::jsonb) || jsonb_build_object(
               'importedRecords', $3::int,
               'attendanceCreated', $4::int,
               'attendanceUpdated', $5::int,
               'breakSessionsCreated', $6::int,
               'importCommitId', $7::text,
               'previewOnly', false
             ),
             rollback_status = 'available',
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenantId, punchesLinked, recordsCreated, recordsUpdated, breakSessionsCreated, importCommit.id],
      );

      await client.query(
        `UPDATE historical_attendance_import_progress
         SET phase = 'completed',
             imported_records = $3,
             processed_rows = total_rows,
             progress_percent = 100,
             message = 'Accepted punches rebuilt into production attendance',
             updated_by = $4,
             updated_at = now()
         WHERE tenant_id = $1 AND batch_id = $2`,
        [tenantId, batchId, punchesLinked, actor.sub],
      );

      await client.query(
        `UPDATE historical_attendance_import_commits
         SET status = 'committed',
             summary = $3,
             committed_at = now(),
             duration_ms = $4,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [importCommit.id, tenantId, JSON.stringify(summary), Date.now() - commitStartedAt],
      );

      await this.logWithClient(client, tenantId, batchId, batch.source_id, 'info', 'attendance_rebuild_committed', actor.sub, summary);
      return { summary, importCommitId: importCommit.id };
    });

    const dependencyRebuild = await this.dependencyRebuildService.rebuildAfterAttendanceCommit(
      tenantId,
      actor,
      batchId,
      run.id,
    );

    return {
      id: run.id,
      status: 'committed',
      summary: commitResult.summary,
      importCommitId: commitResult.importCommitId,
      dependencyRebuild,
    };
  }

  private async buildPlan(
    tenantId: string,
    batchId: string,
    options: { includeUnchanged?: boolean },
  ) {
    const [blockingReconciliation, acceptedPunches] = await Promise.all([
      this.getBlockingReconciliationRows(tenantId, batchId),
      this.getAcceptedPunches(tenantId, batchId, !!options.includeUnchanged),
    ]);

    const blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }> = blockingReconciliation.map((row) => ({
      code: `reconciliation_${row.action}`,
      message: `Reconciliation still has ${row.count} ${row.action} punch(es)`,
      details: { action: row.action, count: row.count },
    }));

    const alreadyAppliedPunches = acceptedPunches.filter((row) => row.linked_attendance_record_id).length;
    const pendingPunches = acceptedPunches.filter((row) => !row.linked_attendance_record_id);
    if (acceptedPunches.length === 0) {
      blockers.push({
        code: 'no_accepted_punches',
        message: 'No accepted reconciliation punches are available for attendance rebuild',
      });
    }

    const resolvedPunches = await this.resolvePunches(tenantId, pendingPunches);
    const grouped = this.groupPunches(resolvedPunches);
    const plans: AttendancePlan[] = [];
    const warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];

    for (const group of grouped.values()) {
      const plan = await this.buildAttendancePlan(tenantId, group);
      plans.push(plan);
      blockers.push(...plan.blockers.map((blocker) => ({ ...blocker, details: { ...blocker.details, employeeId: plan.employeeId, date: plan.date } })));
      warnings.push(...plan.warnings.map((message) => ({
        code: 'attendance_rebuild_warning',
        message,
        details: { employeeId: plan.employeeId, date: plan.date },
      })));
    }

    const summary = this.summarizePlans(acceptedPunches, alreadyAppliedPunches, plans, blockers);
    return { summary, blockers, warnings, plans };
  }

  private async getAcceptedPunches(tenantId: string, batchId: string, includeUnchanged: boolean): Promise<AcceptedPunchRow[]> {
    const impacts = includeUnchanged ? ['create', 'update', 'unchanged'] : ['create', 'update'];
    const { rows } = await this.db.query(
      `SELECT rr.id AS reconciliation_id,
              rr.action AS reconciliation_action,
              rr.attendance_impact,
              rr.existing_attendance_record_id,
              sr.id AS staging_row_id,
              sr.mapped_employee_id,
              sr.punched_at,
              sr.punch_direction,
              sr.device_identifier,
              sr.raw_employee_identifier,
              sr.canonical_punch,
              sr.raw_payload,
              s.source_type,
              s.name AS source_name,
              e.employee_code,
              e.branch_id,
              e.department_id,
              l.attendance_record_id AS linked_attendance_record_id
       FROM historical_attendance_import_reconciliation_results rr
       JOIN historical_attendance_import_staging_rows sr ON sr.id = rr.staging_row_id
       JOIN employees e ON e.id = sr.mapped_employee_id
       LEFT JOIN historical_attendance_import_sources s ON s.id = sr.source_id
       LEFT JOIN historical_attendance_import_attendance_links l ON l.staging_row_id = sr.id
       WHERE rr.tenant_id = $1
         AND rr.batch_id = $2
         AND rr.attendance_impact = ANY($3::text[])
         AND rr.action IN ('create', 'update', 'unchanged')
         AND sr.validation_status IN ('valid', 'warning')
       ORDER BY sr.punched_at ASC, sr.created_at ASC`,
      [tenantId, batchId, impacts],
    );
    return rows;
  }

  private async getBlockingReconciliationRows(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT action, COUNT(*)::int AS count
       FROM historical_attendance_import_reconciliation_results
       WHERE tenant_id = $1
         AND batch_id = $2
         AND action IN ('conflict', 'rejected', 'unknown_employee')
       GROUP BY action`,
      [tenantId, batchId],
    );
    return rows;
  }

  private async resolvePunches(tenantId: string, punches: AcceptedPunchRow[]): Promise<ResolvedPunch[]> {
    const resolved: ResolvedPunch[] = [];
    for (const punch of punches) {
      const punchTime = this.toDate(punch.punched_at);
      if (!punchTime) continue;
      const shift = await this.resolveShiftForPunch(tenantId, punch.mapped_employee_id, punchTime);
      const attendanceDate = shift ? this.resolveShiftDate(punchTime, shift) : punchTime.toISOString().slice(0, 10);
      resolved.push({ ...punch, punchTime, attendanceDate, shift });
    }
    return resolved;
  }

  private groupPunches(punches: ResolvedPunch[]) {
    const groups = new Map<string, ResolvedPunch[]>();
    for (const punch of punches) {
      const key = `${punch.mapped_employee_id}:${punch.attendanceDate}`;
      const group = groups.get(key) ?? [];
      group.push(punch);
      groups.set(key, group);
    }
    return groups;
  }

  private async buildAttendancePlan(tenantId: string, punches: ResolvedPunch[]): Promise<AttendancePlan> {
    const ordered = [...punches].sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
    const first = ordered[0];
    const date = first.attendanceDate;
    const shift = ordered.find((punch) => punch.shift)?.shift ?? null;
    const existing = await this.getExistingAttendance(tenantId, first.mapped_employee_id, date);
    const dayClassification = await this.classifyDay(tenantId, first.branch_id, date);
    const leaveOverlap = await this.hasApprovedLeave(tenantId, first.mapped_employee_id, date);

    const importedClockIn = this.resolveClockIn(ordered);
    const importedClockOut = this.resolveClockOut(ordered, importedClockIn);
    const existingClockIn = this.toDate(existing?.clock_in);
    const existingClockOut = this.toDate(existing?.clock_out);
    const clockIn = this.minDate(existingClockIn, importedClockIn);
    const clockOut = this.maxDate(existingClockOut, importedClockOut);
    const breakPairs = this.resolveBreakPairs(ordered);

    const lateMinutes = shift && clockIn ? this.calculateLateMinutes(clockIn, date, shift) : 0;
    const earlyDepartureMinutes = shift && clockOut ? this.calculateEarlyDepartureMinutes(clockOut, date, shift) : 0;
    const overtimeMinutes = shift && clockOut ? this.calculateOvertimeMinutes(clockOut, date, shift) : 0;
    const missingPunch = !clockIn || !clockOut;
    const noShift = !shift;

    const warnings: string[] = [];
    if (missingPunch) warnings.push('Attendance has a missing clock-in or clock-out punch');
    if (noShift) warnings.push('No shift was resolved for this attendance date');
    if (leaveOverlap) warnings.push('Employee has approved leave overlapping this attendance date');
    if (dayClassification === 'holiday') warnings.push('Attendance falls on a holiday');
    if (dayClassification === 'weekly_off') warnings.push('Attendance falls on a weekly off');

    const correctionBlocker = existing ? await this.getCorrectionBlocker(tenantId, existing.id) : null;
    const blockers: AttendancePlan['blockers'] = [];
    if (correctionBlocker) {
      blockers.push({
        code: 'attendance_correction_history',
        message: 'Attendance has pending or applied correction history and will not be overwritten',
        details: { attendanceRecordId: existing!.id, correctionId: correctionBlocker.id, status: correctionBlocker.status },
      });
    }

    try {
      await this.payrollLock.assertPeriodUnlocked(tenantId, first.mapped_employee_id, date);
    } catch (error: any) {
      blockers.push({
        code: 'payroll_locked',
        message: error?.message ?? 'Payroll period is locked',
        details: { employeeId: first.mapped_employee_id, date },
      });
    }

    const operation = !existing ? 'create' : ordered.length > 0 ? 'update' : 'unchanged';
    const status = this.resolveStatus(dayClassification, !!clockIn || !!clockOut, lateMinutes, earlyDepartureMinutes);
    const sourceDeviceId = ordered.find((punch) => punch.device_identifier)?.device_identifier ?? existing?.source_device_id ?? null;
    const punchSequence = ordered.map((punch) => ({
      time: punch.punchTime.toISOString(),
      type: punch.punch_direction ?? 'unknown',
      method: punch.canonical_punch?.verifyMethod ?? null,
      provider: punch.source_name ?? punch.source_type ?? 'historical_import',
      device: punch.device_identifier ?? null,
      source: 'historical_attendance_import',
      staging_row_id: punch.staging_row_id,
    }));

    const totalBreakMinutesDelta = breakPairs.reduce((sum, pair) => sum + pair.durationMinutes, 0);
    const unpaidBreakMinutesDelta = breakPairs.filter((pair) => !pair.isPaid).reduce((sum, pair) => sum + pair.durationMinutes, 0);
    const remarks = [
      existing?.remarks,
      `Rebuilt from historical attendance import (${ordered.length} accepted punch${ordered.length === 1 ? '' : 'es'})`,
      missingPunch ? 'Missing punch detected' : null,
      leaveOverlap ? 'Approved leave overlap detected' : null,
      dayClassification !== 'business' ? `Day type: ${dayClassification}` : null,
    ].filter(Boolean).join(' | ');

    return {
      key: `${first.mapped_employee_id}:${date}`,
      employeeId: first.mapped_employee_id,
      employeeCode: first.employee_code,
      branchId: first.branch_id,
      departmentId: first.department_id,
      date,
      shift,
      existing,
      punches: ordered,
      operation,
      warnings,
      blockers,
      proposed: {
        clockIn,
        clockOut,
        status,
        lateMinutes,
        earlyDepartureMinutes,
        overtimeMinutes,
        shiftId: shift?.shift_id ?? existing?.shift_id ?? null,
        isOvernight: !!shift?.is_overnight,
        remarks,
        sourceDeviceId,
        punchSequence,
        punchCountDelta: ordered.length,
        breakPairs,
        totalBreakMinutesDelta,
        unpaidBreakMinutesDelta,
      },
      context: {
        dayClassification,
        leaveOverlap,
        missingPunch,
        multiplePunches: ordered.length > 2,
        nightShift: !!shift?.is_overnight,
        noShift,
      },
    };
  }

  private async upsertAttendance(client: any, tenantId: string, plan: AttendancePlan): Promise<ExistingAttendance> {
    if (plan.operation === 'create') {
      const { rows } = await client.query(
        `INSERT INTO attendance_records (
           tenant_id, employee_id, date, clock_in, clock_out, status, shift_id,
           late_minutes, overtime_minutes, early_departure_minutes, provider_name,
           source_device_id, remarks, branch_id, punch_sequence, punch_count,
           is_overnight, total_break_minutes, unpaid_break_minutes, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'historical_import',$11,$12,$13,$14,$15,$16,$17,$18,now()
         )
         ON CONFLICT (tenant_id, employee_id, date) DO NOTHING
         RETURNING *`,
        [
          tenantId,
          plan.employeeId,
          plan.date,
          plan.proposed.clockIn,
          plan.proposed.clockOut,
          plan.proposed.status,
          plan.proposed.shiftId,
          plan.proposed.lateMinutes,
          plan.proposed.overtimeMinutes,
          plan.proposed.earlyDepartureMinutes,
          plan.proposed.sourceDeviceId,
          plan.proposed.remarks,
          plan.branchId,
          JSON.stringify(plan.proposed.punchSequence),
          plan.proposed.punchCountDelta,
          plan.proposed.isOvernight,
          plan.proposed.totalBreakMinutesDelta,
          plan.proposed.unpaidBreakMinutesDelta,
        ],
      );
      if (!rows[0]) {
        throw new BadRequestException(
          `Attendance already exists for ${plan.employeeCode} on ${plan.date}. Regenerate the rebuild summary before committing.`,
        );
      }
      return rows[0];
    }

    const { rows } = await client.query(
      `UPDATE attendance_records
       SET clock_in = $3,
           clock_out = $4,
           status = $5,
           shift_id = COALESCE(shift_id, $6),
           late_minutes = $7,
           overtime_minutes = $8,
           early_departure_minutes = $9,
           provider_name = COALESCE(provider_name, 'historical_import'),
           source_device_id = COALESCE($10, source_device_id),
           remarks = CONCAT_WS(' | ', remarks, $11),
           branch_id = COALESCE(branch_id, $12),
           punch_sequence = COALESCE(punch_sequence, '[]'::jsonb) || $13::jsonb,
           punch_count = COALESCE(punch_count, 0) + $14,
           is_overnight = COALESCE(is_overnight, false) OR $15,
           total_break_minutes = COALESCE(total_break_minutes, 0) + $16,
           unpaid_break_minutes = COALESCE(unpaid_break_minutes, 0) + $17,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        plan.existing!.id,
        tenantId,
        plan.proposed.clockIn,
        plan.proposed.clockOut,
        plan.proposed.status,
        plan.proposed.shiftId,
        plan.proposed.lateMinutes,
        plan.proposed.overtimeMinutes,
        plan.proposed.earlyDepartureMinutes,
        plan.proposed.sourceDeviceId,
        plan.proposed.remarks,
        plan.branchId,
        JSON.stringify(plan.proposed.punchSequence),
        plan.proposed.punchCountDelta,
        plan.proposed.isOvernight,
        plan.proposed.totalBreakMinutesDelta,
        plan.proposed.unpaidBreakMinutesDelta,
      ],
    );
    return rows[0];
  }

  private async insertBreakSessions(client: any, tenantId: string, attendanceRecordId: string, plan: AttendancePlan) {
    const insertedRows: any[] = [];
    for (const pair of plan.proposed.breakPairs) {
      const { rows } = await client.query(
        `INSERT INTO break_sessions (
           tenant_id, employee_id, attendance_record_id, date, break_code,
           category, reason_label, note, status, started_at, ended_at,
           duration_minutes, allowed_minutes, is_paid, overdue_minutes, is_overdue
         ) VALUES (
           $1,$2,$3,$4,'historical_import_break','temporary_break','Imported Break',
           $5,'completed',$6,$7,$8,NULL,$9,0,false
          )
          RETURNING *`,
        [
          tenantId,
          plan.employeeId,
          attendanceRecordId,
          plan.date,
          `Historical import staging rows: ${pair.stagingRowIds.join(', ')}`,
          pair.startedAt,
          pair.endedAt,
          pair.durationMinutes,
          pair.isPaid,
        ],
      );
      insertedRows.push(...rows);
    }
    return insertedRows;
  }

  private resolveClockIn(punches: ResolvedPunch[]) {
    const inPunch = punches.find((punch) => this.directionGroup(punch.punch_direction) === 'in');
    if (inPunch) return inPunch.punchTime;
    const workPunches = punches.filter((punch) => ['in', 'out', 'unknown'].includes(this.directionGroup(punch.punch_direction)));
    return workPunches[0]?.punchTime ?? null;
  }

  private resolveClockOut(punches: ResolvedPunch[], clockIn: Date | null) {
    const outPunches = punches.filter((punch) => this.directionGroup(punch.punch_direction) === 'out');
    if (outPunches.length) return outPunches[outPunches.length - 1].punchTime;
    const workPunches = punches.filter((punch) => ['in', 'out', 'unknown'].includes(this.directionGroup(punch.punch_direction)));
    const last = workPunches[workPunches.length - 1]?.punchTime ?? null;
    if (!last || !clockIn || last.getTime() === clockIn.getTime()) return null;
    return last;
  }

  private resolveBreakPairs(punches: ResolvedPunch[]): BreakPair[] {
    const pairs: BreakPair[] = [];
    let openBreak: ResolvedPunch | null = null;
    for (const punch of punches) {
      const direction = String(punch.punch_direction ?? '').toLowerCase();
      if (direction === 'break_out') {
        openBreak = punch;
      } else if (direction === 'break_in' && openBreak && punch.punchTime > openBreak.punchTime) {
        const durationMinutes = Math.max(0, Math.round((punch.punchTime.getTime() - openBreak.punchTime.getTime()) / 60000));
        pairs.push({
          startedAt: openBreak.punchTime,
          endedAt: punch.punchTime,
          durationMinutes,
          isPaid: true,
          stagingRowIds: [openBreak.staging_row_id, punch.staging_row_id],
        });
        openBreak = null;
      }
    }
    return pairs;
  }

  private async resolveShiftForPunch(tenantId: string, employeeId: string, punchTime: Date): Promise<ShiftRow | null> {
    const dateStr = punchTime.toISOString().slice(0, 10);
    const sameDay = await this.queryShift(tenantId, employeeId, dateStr);
    if (sameDay) return sameDay;

    const previous = new Date(punchTime);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const previousShift = await this.queryShift(tenantId, employeeId, previous.toISOString().slice(0, 10));
    return previousShift?.is_overnight ? previousShift : null;
  }

  private async queryShift(tenantId: string, employeeId: string, dateStr: string): Promise<ShiftRow | null> {
    const { rows: scheduled } = await this.db.query(
      `SELECT ss.shift_id, sd.start_time, sd.end_time, sd.grace_period_minutes,
              COALESCE(sd.is_overnight, false) AS is_overnight
       FROM shift_schedules ss
       JOIN shift_definitions sd ON sd.id = ss.shift_id
       WHERE ss.tenant_id = $1
         AND ss.employee_id = $2
         AND ss.date = $3
         AND ss.status <> 'cancelled'
         AND sd.is_active = true
       LIMIT 1`,
      [tenantId, employeeId, dateStr],
    );
    if (scheduled[0]) return scheduled[0];

    const { rows: assigned } = await this.db.query(
      `SELECT sa.shift_id, sd.start_time, sd.end_time, sd.grace_period_minutes,
              COALESCE(sd.is_overnight, false) AS is_overnight
       FROM shift_assignments sa
       JOIN shift_definitions sd ON sd.id = sa.shift_id
       WHERE sa.tenant_id = $1
         AND sa.employee_id = $2
         AND sa.is_active = true
         AND sa.start_date <= $3
         AND (sa.end_date IS NULL OR sa.end_date >= $3)
         AND sd.is_active = true
       ORDER BY sa.start_date DESC
       LIMIT 1`,
      [tenantId, employeeId, dateStr],
    );
    return assigned[0] ?? null;
  }

  private resolveShiftDate(punchTime: Date, shift: ShiftRow) {
    const dateStr = punchTime.toISOString().slice(0, 10);
    if (!shift.is_overnight) return dateStr;
    const [startHour] = String(shift.start_time).split(':').map(Number);
    if (punchTime.getUTCHours() < startHour) {
      const previous = new Date(punchTime);
      previous.setUTCDate(previous.getUTCDate() - 1);
      return previous.toISOString().slice(0, 10);
    }
    return dateStr;
  }

  private calculateLateMinutes(clockIn: Date, shiftDate: string, shift: ShiftRow) {
    const shiftStart = this.shiftBoundary(shiftDate, shift.start_time);
    const graceDeadline = new Date(shiftStart.getTime() + Number(shift.grace_period_minutes ?? 0) * 60_000);
    return clockIn > graceDeadline ? Math.floor((clockIn.getTime() - shiftStart.getTime()) / 60_000) : 0;
  }

  private calculateEarlyDepartureMinutes(clockOut: Date, shiftDate: string, shift: ShiftRow) {
    const shiftEnd = this.shiftEndBoundary(shiftDate, shift);
    return clockOut < shiftEnd ? Math.floor((shiftEnd.getTime() - clockOut.getTime()) / 60_000) : 0;
  }

  private calculateOvertimeMinutes(clockOut: Date, shiftDate: string, shift: ShiftRow) {
    const shiftEnd = this.shiftEndBoundary(shiftDate, shift);
    return clockOut > shiftEnd ? Math.floor((clockOut.getTime() - shiftEnd.getTime()) / 60_000) : 0;
  }

  private shiftBoundary(date: string, time: string | number) {
    const [hour, minute, second = 0] = String(time).split(':').map(Number);
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  private shiftEndBoundary(date: string, shift: ShiftRow) {
    const end = this.shiftBoundary(date, shift.end_time);
    if (shift.is_overnight) end.setUTCDate(end.getUTCDate() + 1);
    return end;
  }

  private async classifyDay(tenantId: string, branchId: string | null, date: string): Promise<'business' | 'holiday' | 'weekly_off'> {
    const { rows: holidayRows } = await this.db.query(
      `SELECT 1 FROM holidays
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND holiday_date = $2
         AND (branch_id IS NULL OR branch_id = $3)
       LIMIT 1`,
      [tenantId, date, branchId],
    );
    if (holidayRows.length) return 'holiday';

    const { rows } = await this.db.query('SELECT work_week_config FROM tenants WHERE id = $1', [tenantId]);
    const config = rows[0]?.work_week_config ?? {};
    const workWeek = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false, ...config };
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[new Date(`${date}T00:00:00Z`).getUTCDay()];
    return workWeek[dayKey] ? 'business' : 'weekly_off';
  }

  private async hasApprovedLeave(tenantId: string, employeeId: string, date: string) {
    const { rows } = await this.db.query(
      `SELECT 1 FROM leave_requests
       WHERE tenant_id = $1
         AND employee_id = $2
         AND status = 'approved'
         AND start_date <= $3
         AND end_date >= $3
       LIMIT 1`,
      [tenantId, employeeId, date],
    );
    return rows.length > 0;
  }

  private async getExistingAttendance(tenantId: string, employeeId: string, date: string): Promise<ExistingAttendance | null> {
    const { rows } = await this.db.query(
      `SELECT * FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, date],
    );
    return rows[0] ?? null;
  }

  private async getCorrectionBlocker(tenantId: string, attendanceRecordId: string) {
    const { rows } = await this.db.query(
      `SELECT id, status
       FROM attendance_corrections
       WHERE tenant_id = $1
         AND attendance_record_id = $2
         AND status IN ('pending', 'approved', 'applied')
       ORDER BY requested_at DESC
       LIMIT 1`,
      [tenantId, attendanceRecordId],
    );
    return rows[0] ?? null;
  }

  private resolveStatus(dayClassification: 'business' | 'holiday' | 'weekly_off', hasPunch: boolean, lateMinutes: number, earlyDepartureMinutes: number) {
    if (!hasPunch) return 'absent';
    if (dayClassification === 'holiday' || dayClassification === 'weekly_off') return 'on_duty';
    if (lateMinutes > 0) return 'late';
    if (earlyDepartureMinutes > 0) return 'early_exit';
    return 'present';
  }

  private summarizePlans(
    acceptedPunches: AcceptedPunchRow[],
    alreadyAppliedPunches: number,
    plans: AttendancePlan[],
    blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>,
  ) {
    return {
      acceptedPunches: acceptedPunches.length,
      pendingPunches: acceptedPunches.length - alreadyAppliedPunches,
      alreadyAppliedPunches,
      attendanceToCreate: plans.filter((plan) => plan.operation === 'create').length,
      attendanceToUpdate: plans.filter((plan) => plan.operation === 'update').length,
      attendanceUnchanged: plans.filter((plan) => plan.operation === 'unchanged').length,
      multiplePunchDays: plans.filter((plan) => plan.context.multiplePunches).length,
      nightShiftDays: plans.filter((plan) => plan.context.nightShift).length,
      lateArrivals: plans.filter((plan) => plan.proposed.lateMinutes > 0).length,
      earlyDepartures: plans.filter((plan) => plan.proposed.earlyDepartureMinutes > 0).length,
      overtimeDays: plans.filter((plan) => plan.proposed.overtimeMinutes > 0).length,
      missingPunches: plans.filter((plan) => plan.context.missingPunch).length,
      breakSessions: plans.reduce((sum, plan) => sum + plan.proposed.breakPairs.length, 0),
      holidayWorkDays: plans.filter((plan) => plan.context.dayClassification === 'holiday').length,
      weeklyOffWorkDays: plans.filter((plan) => plan.context.dayClassification === 'weekly_off').length,
      leaveOverlapDays: plans.filter((plan) => plan.context.leaveOverlap).length,
      noShiftDays: plans.filter((plan) => plan.context.noShift).length,
      blockers: blockers.length,
      canCommit: blockers.length === 0,
    };
  }

  private serializePlan(plan: AttendancePlan) {
    return {
      employeeId: plan.employeeId,
      employeeCode: plan.employeeCode,
      date: plan.date,
      operation: plan.operation,
      punchCount: plan.punches.length,
      clockIn: plan.proposed.clockIn?.toISOString() ?? null,
      clockOut: plan.proposed.clockOut?.toISOString() ?? null,
      status: plan.proposed.status,
      lateMinutes: plan.proposed.lateMinutes,
      earlyDepartureMinutes: plan.proposed.earlyDepartureMinutes,
      overtimeMinutes: plan.proposed.overtimeMinutes,
      breakSessions: plan.proposed.breakPairs.length,
      dayClassification: plan.context.dayClassification,
      leaveOverlap: plan.context.leaveOverlap,
      blockers: plan.blockers,
      warnings: plan.warnings,
    };
  }

  private directionGroup(direction: unknown) {
    const value = String(direction ?? 'unknown').toLowerCase();
    if (value === 'break_in') return 'break_in';
    if (value === 'break_out') return 'break_out';
    if (value === 'in') return 'in';
    if (value === 'out') return 'out';
    if (value.includes('in')) return 'in';
    if (value.includes('out')) return 'out';
    return 'unknown';
  }

  private minDate(left: Date | null, right: Date | null) {
    if (!left) return right;
    if (!right) return left;
    return left < right ? left : right;
  }

  private maxDate(left: Date | null, right: Date | null) {
    if (!left) return right;
    if (!right) return left;
    return left > right ? left : right;
  }

  private toDate(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toIso(value: Date | string | null | undefined) {
    return this.toDate(value)?.toISOString() ?? null;
  }

  private async createImportCommitWithClient(client: any, params: {
    tenantId: string;
    batchId: string;
    rebuildRunId: string;
    sourceId: string | null;
    actorUserId: string;
    summary: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }) {
    const { rows } = await client.query(
      `INSERT INTO historical_attendance_import_commits
         (tenant_id, batch_id, rebuild_run_id, source_id, status, summary, import_metadata, created_by)
       VALUES ($1, $2, $3, $4, 'committing', $5, $6, $7)
       RETURNING *`,
      [
        params.tenantId,
        params.batchId,
        params.rebuildRunId,
        params.sourceId,
        JSON.stringify(params.summary),
        JSON.stringify(params.metadata),
        params.actorUserId,
      ],
    );
    return rows[0];
  }

  private async snapshotAttendancePlanWithClient(
    client: any,
    tenantId: string,
    batchId: string,
    rebuildRunId: string,
    commitId: string,
    plan: AttendancePlan,
  ) {
    const entityKey = this.attendanceSnapshotKey(plan);
    await client.query(
      `INSERT INTO historical_attendance_import_commit_snapshots
         (tenant_id, commit_id, batch_id, rebuild_run_id, entity_type, entity_id, entity_key, previous_record, metadata)
       VALUES ($1, $2, $3, $4, 'attendance_record', $5, $6, $7, $8)
       ON CONFLICT (commit_id, entity_type, entity_key) DO NOTHING`,
      [
        tenantId,
        commitId,
        batchId,
        rebuildRunId,
        plan.existing?.id ?? null,
        entityKey,
        plan.existing ? JSON.stringify(plan.existing) : null,
        JSON.stringify({
          operation: plan.operation,
          employeeId: plan.employeeId,
          employeeCode: plan.employeeCode,
          branchId: plan.branchId,
          departmentId: plan.departmentId,
          date: plan.date,
        }),
      ],
    );

    if (!plan.existing?.id) return;

    const { rows } = await client.query(
      `SELECT *
       FROM break_sessions
       WHERE tenant_id = $1 AND attendance_record_id = $2
       ORDER BY started_at ASC, created_at ASC`,
      [tenantId, plan.existing.id],
    );

    for (const row of rows) {
      await client.query(
        `INSERT INTO historical_attendance_import_commit_snapshots
           (tenant_id, commit_id, batch_id, rebuild_run_id, entity_type, entity_id, entity_key, previous_record, metadata)
         VALUES ($1, $2, $3, $4, 'break_session', $5, $6, $7, $8)
         ON CONFLICT (commit_id, entity_type, entity_key) DO NOTHING`,
        [
          tenantId,
          commitId,
          batchId,
          rebuildRunId,
          row.id,
          `break_session:${row.id}`,
          JSON.stringify(row),
          JSON.stringify({
            attendanceRecordId: plan.existing.id,
            employeeId: plan.employeeId,
            date: plan.date,
          }),
        ],
      );
    }
  }

  private async updateSnapshotCurrentWithClient(
    client: any,
    tenantId: string,
    commitId: string,
    entityType: 'attendance_record' | 'break_session' | 'payroll_attendance_summary',
    entityKey: string,
    entityId: string,
    currentRecord: Record<string, unknown>,
  ) {
    await client.query(
      `UPDATE historical_attendance_import_commit_snapshots
       SET entity_id = $4,
           current_record = $5
       WHERE tenant_id = $1
         AND commit_id = $2
         AND entity_type = $3
         AND entity_key = $6`,
      [tenantId, commitId, entityType, entityId, JSON.stringify(currentRecord), entityKey],
    );
  }

  private async snapshotAffectedSummariesWithClient(
    client: any,
    tenantId: string,
    batchId: string,
    rebuildRunId: string,
    commitId: string,
    plans: AttendancePlan[],
  ) {
    const periods = new Map<string, { employeeId: string; periodStart: string; periodEnd: string }>();
    for (const plan of plans) {
      if (plan.operation === 'unchanged') continue;
      const { periodStart, periodEnd } = this.monthPeriodFor(plan.date);
      periods.set(`${plan.employeeId}:${periodStart}:${periodEnd}`, {
        employeeId: plan.employeeId,
        periodStart,
        periodEnd,
      });
    }

    for (const period of periods.values()) {
      const { rows } = await client.query(
        `SELECT *
         FROM payroll_attendance_summary
         WHERE tenant_id = $1
           AND employee_id = $2
           AND period_start = $3
           AND period_end = $4`,
        [tenantId, period.employeeId, period.periodStart, period.periodEnd],
      );
      const existing = rows[0] ?? null;
      await client.query(
        `INSERT INTO historical_attendance_import_commit_snapshots
           (tenant_id, commit_id, batch_id, rebuild_run_id, entity_type, entity_id, entity_key, previous_record, metadata)
         VALUES ($1, $2, $3, $4, 'payroll_attendance_summary', $5, $6, $7, $8)
         ON CONFLICT (commit_id, entity_type, entity_key) DO NOTHING`,
        [
          tenantId,
          commitId,
          batchId,
          rebuildRunId,
          existing?.id ?? null,
          `payroll_summary:${period.employeeId}:${period.periodStart}:${period.periodEnd}`,
          existing ? JSON.stringify(existing) : null,
          JSON.stringify(period),
        ],
      );
    }
  }

  private attendanceSnapshotKey(plan: AttendancePlan) {
    return `attendance:${plan.employeeId}:${plan.date}`;
  }

  private monthPeriodFor(date: string) {
    const value = new Date(`${date}T00:00:00Z`);
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { periodStart, periodEnd };
  }

  private async getBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_batches
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [batchId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import batch not found');
    return rows[0];
  }

  private async getSummaryRun(tenantId: string, batchId: string, runId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_rebuild_runs
       WHERE id = $1 AND tenant_id = $2 AND batch_id = $3`,
      [runId, tenantId, batchId],
    );
    if (!rows.length) throw new NotFoundException('Attendance rebuild summary not found');
    return rows[0];
  }

  private async markRunFailed(tenantId: string, runId: string, reason: string) {
    await this.db.query(
      `UPDATE historical_attendance_import_rebuild_runs
       SET status = 'failed', failed_reason = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, reason],
    );
  }

  private async assertEnabled(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT historical_attendance_import_enabled
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (!rows.length) throw new NotFoundException('Organization not found');
    if (!rows[0].historical_attendance_import_enabled) {
      throw new BadRequestException('Historical attendance import is not enabled for this organization');
    }
  }

  private async writeAttendanceAuditWithClient(client: any, params: {
    tenantId: string;
    employeeId?: string | null;
    attendanceRecordId?: string | null;
    eventType: string;
    actorType?: string;
    actorId?: string | null;
    beforeState?: Record<string, any> | null;
    afterState?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
  }) {
    await client.query(
      `INSERT INTO attendance_audit_logs
         (tenant_id, employee_id, attendance_record_id, event_type,
          actor_type, actor_id, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.tenantId,
        params.employeeId ?? null,
        params.attendanceRecordId ?? null,
        params.eventType,
        params.actorType ?? 'system',
        params.actorId ?? null,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
  }

  private async log(
    tenantId: string,
    batchId: string,
    sourceId: string | null,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await this.logWithClient(this.db, tenantId, batchId, sourceId, level, code, actorUserId, details);
  }

  private async logWithClient(
    client: any,
    tenantId: string,
    batchId: string,
    sourceId: string | null,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, source_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, batchId, sourceId, level, code, code.replace(/_/g, ' '), details, actorUserId],
    );
  }
}
