import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AttendanceSummaryService } from '../../hr/services/attendance-summary.service';
import { AttendanceBehaviourEngineService } from '../../hr/services/attendance-behaviour-engine.service';

interface Actor {
  sub: string;
}

interface AffectedRange {
  employeeId: string;
  employeeCode: string;
  branchId: string | null;
  departmentId: string | null;
  dateFrom: string;
  dateTo: string;
}

interface ProgressStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'warning' | 'failed';
  total?: number;
  completed?: number;
  skipped?: number;
  warnings?: string[];
  startedAt?: string;
  completedAt?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class HistoricalAttendanceDependencyRebuildService {
  constructor(
    private readonly db: DatabaseService,
    private readonly attendanceSummaryService: AttendanceSummaryService,
    private readonly attendanceBehaviourEngine: AttendanceBehaviourEngineService,
  ) {}

  async rebuildAfterAttendanceCommit(
    tenantId: string,
    actor: Actor,
    batchId: string,
    attendanceRebuildRunId: string,
  ) {
    const affectedRanges = await this.getAffectedRanges(tenantId, batchId, attendanceRebuildRunId);
    return this.rebuildAffectedRanges(tenantId, actor, batchId, attendanceRebuildRunId, affectedRanges);
  }

  async rebuildAfterRollback(
    tenantId: string,
    actor: Actor,
    batchId: string,
    affectedRanges: AffectedRange[],
  ) {
    return this.rebuildAffectedRanges(tenantId, actor, batchId, null, affectedRanges);
  }

  private async rebuildAffectedRanges(
    tenantId: string,
    actor: Actor,
    batchId: string,
    attendanceRebuildRunId: string | null,
    affectedRanges: AffectedRange[],
  ) {
    const affectedEmployees = affectedRanges.map((range) => ({
      employeeId: range.employeeId,
      employeeCode: range.employeeCode,
      branchId: range.branchId,
      departmentId: range.departmentId,
    }));

    const steps = this.createSteps();
    const run = await this.createRun(tenantId, batchId, attendanceRebuildRunId, actor.sub, affectedEmployees, affectedRanges, steps);

    if (affectedRanges.length === 0) {
      const summary = { affectedEmployees: 0, affectedMonths: 0, message: 'No newly applied attendance links found' };
      await this.finishRun(run.id, tenantId, 'completed_with_warnings', steps, summary, [{
        code: 'no_affected_attendance',
        message: 'No affected attendance records were found for dependency rebuild',
      }]);
      return this.getRun(tenantId, run.id);
    }

    const warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }> = [];
    const summary: Record<string, unknown> = {
      affectedEmployees: affectedEmployees.length,
      affectedDateRanges: affectedRanges.length,
      affectedMonths: this.getAffectedEmployeeMonths(affectedRanges).length,
    };

    try {
      await this.markRunRunning(run.id, tenantId, steps);

      await this.runStep(run.id, tenantId, steps, 'affected_scope', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          employees: affectedEmployees.length,
          dateFrom: affectedRanges.reduce((min, range) => min < range.dateFrom ? min : range.dateFrom, affectedRanges[0].dateFrom),
          dateTo: affectedRanges.reduce((max, range) => max > range.dateTo ? max : range.dateTo, affectedRanges[0].dateTo),
        };
      });

      await this.runStep(run.id, tenantId, steps, 'payroll_attendance_summary', async (step) => {
        const affectedMonths = this.getAffectedEmployeeMonths(affectedRanges);
        step.total = affectedMonths.length;
        step.completed = 0;
        step.skipped = 0;

        let computed = 0;
        let skippedLocked = 0;
        let skippedNoChange = 0;
        for (const item of affectedMonths) {
          const result = await this.attendanceSummaryService.compute(
            tenantId,
            item.year,
            item.month,
            { type: 'employee', employeeIds: [item.employeeId] },
            actor.sub,
          );
          computed += result.computed;
          skippedLocked += result.skippedLocked;
          skippedNoChange += result.skippedNoStructureChange;
          step.completed = (step.completed ?? 0) + 1;
          step.skipped = skippedLocked;
          await this.persistProgress(run.id, tenantId, steps);
        }

        summary.payrollAttendanceSummary = { computed, skippedLocked, skippedNoChange };
        if (skippedLocked > 0) {
          warnings.push({
            code: 'payroll_locked_periods_skipped',
            message: `${skippedLocked} payroll attendance summary period(s) were locked and skipped`,
          });
        }
      });

      await this.runStep(run.id, tenantId, steps, 'late_count', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          source: 'attendance_records.late_minutes and payroll_attendance_summary.late_count',
          rebuiltBy: 'payroll_attendance_summary',
        };
      });

      await this.runStep(run.id, tenantId, steps, 'overtime', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          source: 'attendance_records.overtime_minutes and payroll_attendance_summary.overtime_hours',
          rebuiltBy: 'payroll_attendance_summary',
        };
      });

      await this.runStep(run.id, tenantId, steps, 'performance_attendance_metrics', async (step) => {
        const targets = await this.getPerformanceTargets(tenantId, affectedRanges);
        step.total = targets.length;
        step.completed = 0;
        step.skipped = 0;

        let rebuilt = 0;
        let skipped = 0;
        for (const target of targets) {
          try {
            await this.attendanceBehaviourEngine.generateSnapshot(tenantId, target.cycleId, target.employeeId, actor.sub);
            rebuilt++;
          } catch (error: any) {
            skipped++;
            warnings.push({
              code: 'performance_snapshot_skipped',
              message: error?.message ?? 'Performance attendance snapshot could not be rebuilt',
              details: target,
            });
          }
          step.completed = rebuilt;
          step.skipped = skipped;
          await this.persistProgress(run.id, tenantId, steps);
        }
        summary.performanceAttendanceMetrics = { rebuilt, skipped };
      });

      await this.runStep(run.id, tenantId, steps, 'attendance_kpis', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          mode: 'live_query',
          note: 'Attendance KPIs read directly from attendance_records/payroll_attendance_summary and are current after targeted summary rebuild',
        };
      });

      await this.runStep(run.id, tenantId, steps, 'reports', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          mode: 'live_query',
          note: 'Reports are SQL-backed and scoped by date filters; no organization-wide rebuild required',
        };
      });

      await this.runStep(run.id, tenantId, steps, 'dashboard_statistics', async (step) => {
        step.total = affectedRanges.length;
        step.completed = affectedRanges.length;
        step.details = {
          mode: 'live_query',
          note: 'Dashboard statistics query attendance_records directly and reflect rebuilt attendance immediately',
        };
      });

      const status = warnings.length > 0 ? 'completed_with_warnings' : 'completed';
      await this.finishRun(run.id, tenantId, status, steps, summary, warnings);
      await this.log(tenantId, batchId, 'info', 'dependency_rebuild_completed', actor.sub, { runId: run.id, status, summary });
      return this.getRun(tenantId, run.id);
    } catch (error: any) {
      await this.failRun(run.id, tenantId, steps, error?.message ?? 'Dependency rebuild failed');
      await this.log(tenantId, batchId, 'error', 'dependency_rebuild_failed', actor.sub, {
        runId: run.id,
        error: error?.message ?? 'Dependency rebuild failed',
      });
      throw error;
    }
  }

  async getLatestForBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_dependency_rebuild_runs
       WHERE tenant_id = $1 AND batch_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, batchId],
    );
    return rows[0] ?? null;
  }

  async getRun(tenantId: string, runId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_dependency_rebuild_runs
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, runId],
    );
    return rows[0] ?? null;
  }

  private createSteps(): ProgressStep[] {
    return [
      { key: 'affected_scope', label: 'Resolve affected employees and date ranges', status: 'pending' },
      { key: 'payroll_attendance_summary', label: 'Recompute attendance/monthly/payroll attendance summaries', status: 'pending' },
      { key: 'late_count', label: 'Refresh late count rollups', status: 'pending' },
      { key: 'overtime', label: 'Refresh overtime rollups', status: 'pending' },
      { key: 'performance_attendance_metrics', label: 'Recompute performance attendance metrics', status: 'pending' },
      { key: 'attendance_kpis', label: 'Refresh attendance KPIs', status: 'pending' },
      { key: 'reports', label: 'Refresh reports', status: 'pending' },
      { key: 'dashboard_statistics', label: 'Refresh dashboard statistics', status: 'pending' },
    ];
  }

  private async getAffectedRanges(tenantId: string, batchId: string, attendanceRebuildRunId: string): Promise<AffectedRange[]> {
    const { rows } = await this.db.query(
      `SELECT ar.employee_id,
              e.employee_code,
              e.branch_id,
              e.department_id,
              MIN(ar.date)::date AS date_from,
              MAX(ar.date)::date AS date_to
       FROM historical_attendance_import_attendance_links l
       JOIN attendance_records ar ON ar.id = l.attendance_record_id
       JOIN employees e ON e.id = ar.employee_id
       WHERE l.tenant_id = $1
         AND l.batch_id = $2
         AND l.rebuild_run_id = $3
       GROUP BY ar.employee_id, e.employee_code, e.branch_id, e.department_id
       ORDER BY e.employee_code`,
      [tenantId, batchId, attendanceRebuildRunId],
    );

    return rows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      branchId: row.branch_id,
      departmentId: row.department_id,
      dateFrom: this.toDateString(row.date_from),
      dateTo: this.toDateString(row.date_to),
    }));
  }

  private getAffectedEmployeeMonths(ranges: AffectedRange[]) {
    const byKey = new Map<string, { employeeId: string; month: number; year: number }>();
    for (const range of ranges) {
      const start = new Date(`${range.dateFrom}T00:00:00Z`);
      const end = new Date(`${range.dateTo}T00:00:00Z`);
      let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      while (cursor <= last) {
        const item = {
          employeeId: range.employeeId,
          month: cursor.getUTCMonth() + 1,
          year: cursor.getUTCFullYear(),
        };
        byKey.set(`${item.employeeId}:${item.year}:${item.month}`, item);
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      }
    }
    return [...byKey.values()];
  }

  private async getPerformanceTargets(tenantId: string, ranges: AffectedRange[]) {
    const targets = new Map<string, { cycleId: string; employeeId: string }>();
    for (const range of ranges) {
      const { rows } = await this.db.query(
        `SELECT id
         FROM review_cycles
         WHERE tenant_id = $1
           AND status = 'active'
           AND start_date <= $3
           AND end_date >= $2`,
        [tenantId, range.dateFrom, range.dateTo],
      );
      for (const cycle of rows) {
        const key = `${cycle.id}:${range.employeeId}`;
        targets.set(key, { cycleId: cycle.id, employeeId: range.employeeId });
      }
    }
    return [...targets.values()];
  }

  private async createRun(
    tenantId: string,
    batchId: string,
    attendanceRebuildRunId: string | null,
    actorUserId: string,
    affectedEmployees: unknown[],
    affectedRanges: unknown[],
    steps: ProgressStep[],
  ) {
    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_dependency_rebuild_runs
         (tenant_id, batch_id, attendance_rebuild_run_id, status, total_steps,
          affected_employees, affected_ranges, steps, created_by)
       VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        batchId,
        attendanceRebuildRunId,
        steps.length,
        JSON.stringify(affectedEmployees),
        JSON.stringify(affectedRanges),
        JSON.stringify(steps),
        actorUserId,
      ],
    );
    return rows[0];
  }

  private async markRunRunning(runId: string, tenantId: string, steps: ProgressStep[]) {
    await this.db.query(
      `UPDATE historical_attendance_import_dependency_rebuild_runs
       SET status = 'running',
           steps = $3,
           started_at = COALESCE(started_at, now()),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, JSON.stringify(steps)],
    );
  }

  private async runStep(
    runId: string,
    tenantId: string,
    steps: ProgressStep[],
    key: string,
    fn: (step: ProgressStep) => Promise<void>,
  ) {
    const step = steps.find((item) => item.key === key)!;
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    await this.persistProgress(runId, tenantId, steps);

    try {
      await fn(step);
      if (step.status === 'running') step.status = 'completed';
      step.completedAt = new Date().toISOString();
      await this.persistProgress(runId, tenantId, steps);
    } catch (error: any) {
      step.status = 'failed';
      step.completedAt = new Date().toISOString();
      step.warnings = [...(step.warnings ?? []), error?.message ?? 'Step failed'];
      await this.persistProgress(runId, tenantId, steps);
      throw error;
    }
  }

  private async persistProgress(runId: string, tenantId: string, steps: ProgressStep[]) {
    const completedSteps = steps.filter((step) => ['completed', 'skipped', 'warning'].includes(step.status)).length;
    const progressPercent = steps.length ? Math.round((completedSteps / steps.length) * 10000) / 100 : 0;
    await this.db.query(
      `UPDATE historical_attendance_import_dependency_rebuild_runs
       SET completed_steps = $3,
           progress_percent = $4,
           steps = $5,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, completedSteps, progressPercent, JSON.stringify(steps)],
    );
  }

  private async finishRun(
    runId: string,
    tenantId: string,
    status: 'completed' | 'completed_with_warnings',
    steps: ProgressStep[],
    summary: Record<string, unknown>,
    warnings: unknown[],
  ) {
    const completedSteps = steps.length;
    await this.db.query(
      `UPDATE historical_attendance_import_dependency_rebuild_runs
       SET status = $3,
           completed_steps = $4,
           progress_percent = 100,
           steps = $5,
           summary = $6,
           warnings = $7,
           completed_at = now(),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, status, completedSteps, JSON.stringify(steps), JSON.stringify(summary), JSON.stringify(warnings)],
    );
  }

  private async failRun(runId: string, tenantId: string, steps: ProgressStep[], error: string) {
    await this.db.query(
      `UPDATE historical_attendance_import_dependency_rebuild_runs
       SET status = 'failed',
           steps = $3,
           error = $4,
           completed_at = now(),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId, JSON.stringify(steps), error],
    );
  }

  private async log(
    tenantId: string,
    batchId: string,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, batchId, level, code, code.replace(/_/g, ' '), JSON.stringify(details), actorUserId],
    );
  }

  private toDateString(value: string | Date) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
}
