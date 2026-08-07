import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { HistoricalAttendanceDependencyRebuildService } from './historical-attendance-dependency-rebuild.service';

interface Actor {
  sub: string;
}

interface SnapshotRow {
  id: string;
  entity_type: 'attendance_record' | 'break_session' | 'payroll_attendance_summary';
  entity_id: string | null;
  entity_key: string;
  previous_record: Record<string, any> | null;
  current_record: Record<string, any> | null;
  metadata: Record<string, any>;
}

@Injectable()
export class HistoricalAttendanceRollbackService {
  constructor(
    private readonly db: DatabaseService,
    private readonly dependencyRebuildService: HistoricalAttendanceDependencyRebuildService,
  ) {}

  async rollbackBatch(tenantId: string, actor: Actor, batchId: string, reason?: string) {
    await this.assertEnabled(tenantId);
    const commit = await this.getCommitForBatch(tenantId, batchId);
    if (!commit) throw new NotFoundException('Import commit not found for this batch');
    return this.rollbackCommit(tenantId, actor, commit.id, reason);
  }

  async rollbackCommit(tenantId: string, actor: Actor, commitId: string, reason?: string) {
    await this.assertEnabled(tenantId);
    const commit = await this.getCommit(tenantId, commitId);
    if (!commit) throw new NotFoundException('Import commit not found');
    if (!['committed', 'rollback_failed'].includes(commit.status)) {
      throw new BadRequestException('Only committed or failed rollback imports can be rolled back');
    }

    const affectedRanges = await this.getAffectedRanges(tenantId, commitId);
    let rollbackResult: any;
    try {
      rollbackResult = await this.db.transaction(async (client) => {
      const locked = await client.query(
        `SELECT *
         FROM historical_attendance_import_commits
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [commitId, tenantId],
      );
      const currentCommit = locked.rows[0];
      if (!currentCommit || !['committed', 'rollback_failed'].includes(currentCommit.status)) {
        throw new BadRequestException('Import commit is not available for rollback');
      }

      const { rows: runRows } = await client.query(
        `INSERT INTO historical_attendance_import_rollback_runs
           (tenant_id, batch_id, commit_id, total_steps, affected_ranges, created_by)
         VALUES ($1, $2, $3, 4, $4, $5)
         RETURNING *`,
        [tenantId, currentCommit.batch_id, currentCommit.id, JSON.stringify(affectedRanges), actor.sub],
      );
      const rollbackRun = runRows[0];

      await client.query(
        `UPDATE historical_attendance_import_commits
         SET status = 'rolling_back',
             rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [currentCommit.id, tenantId, JSON.stringify({ reason: reason ?? null, rollbackRunId: rollbackRun.id })],
      );

      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = 'rolling_back',
             rollback_status = 'in_progress',
             rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [currentCommit.batch_id, tenantId, JSON.stringify({ reason: reason ?? null, rollbackRunId: rollbackRun.id })],
      );

      await this.markRollbackProgress(client, tenantId, rollbackRun.id, 1);

      const snapshots = await this.getSnapshotsWithClient(client, tenantId, currentCommit.id);
      const attendanceSnapshots = snapshots.filter((snapshot) => snapshot.entity_type === 'attendance_record');
      const breakSnapshots = snapshots.filter((snapshot) => snapshot.entity_type === 'break_session');
      const summarySnapshots = snapshots.filter((snapshot) => snapshot.entity_type === 'payroll_attendance_summary');

      await client.query(
        `DELETE FROM historical_attendance_import_attendance_links
         WHERE tenant_id = $1 AND commit_id = $2`,
        [tenantId, currentCommit.id],
      );

      let restoredAttendanceRecords = 0;
      let deletedAttendanceRecords = 0;
      let restoredBreakSessions = 0;
      let restoredSummaries = 0;
      let deletedSummaries = 0;

      for (const snapshot of attendanceSnapshots) {
        const recordId = snapshot.entity_id ?? snapshot.previous_record?.id ?? snapshot.current_record?.id;
        if (!recordId) continue;

        await client.query('DELETE FROM break_sessions WHERE tenant_id = $1 AND attendance_record_id = $2', [tenantId, recordId]);

        if (snapshot.previous_record) {
          await client.query('DELETE FROM attendance_records WHERE tenant_id = $1 AND id = $2', [tenantId, recordId]);
          await client.query(
            `INSERT INTO attendance_records
             SELECT * FROM jsonb_populate_record(NULL::attendance_records, $1::jsonb)`,
            [JSON.stringify(snapshot.previous_record)],
          );
          restoredAttendanceRecords++;

          for (const breakSnapshot of breakSnapshots.filter((item) => item.metadata?.attendanceRecordId === recordId)) {
            if (!breakSnapshot.previous_record) continue;
            await client.query(
              `INSERT INTO break_sessions
               SELECT * FROM jsonb_populate_record(NULL::break_sessions, $1::jsonb)`,
              [JSON.stringify(breakSnapshot.previous_record)],
            );
            restoredBreakSessions++;
          }
        } else {
          await client.query('DELETE FROM attendance_records WHERE tenant_id = $1 AND id = $2', [tenantId, recordId]);
          deletedAttendanceRecords++;
        }

        await this.writeAttendanceAuditWithClient(client, {
          tenantId,
          employeeId: snapshot.metadata?.employeeId ?? snapshot.previous_record?.employee_id ?? snapshot.current_record?.employee_id,
          attendanceRecordId: recordId,
          eventType: 'record_reverted',
          actorId: actor.sub,
          beforeState: snapshot.current_record,
          afterState: snapshot.previous_record,
          metadata: {
            source: 'historical_attendance_import',
            batchId: currentCommit.batch_id,
            importCommitId: currentCommit.id,
            rollbackRunId: rollbackRun.id,
            reason: reason ?? null,
          },
        });
      }

      await this.markRollbackProgress(client, tenantId, rollbackRun.id, 2);

      for (const snapshot of summarySnapshots) {
        const metadata = snapshot.metadata ?? {};
        if (snapshot.entity_id) {
          await client.query('DELETE FROM payroll_attendance_summary WHERE tenant_id = $1 AND id = $2', [tenantId, snapshot.entity_id]);
        } else if (metadata.employeeId && metadata.periodStart && metadata.periodEnd) {
          await client.query(
            `DELETE FROM payroll_attendance_summary
             WHERE tenant_id = $1 AND employee_id = $2 AND period_start = $3 AND period_end = $4`,
            [tenantId, metadata.employeeId, metadata.periodStart, metadata.periodEnd],
          );
        }

        if (snapshot.previous_record) {
          await client.query(
            `INSERT INTO payroll_attendance_summary
             SELECT * FROM jsonb_populate_record(NULL::payroll_attendance_summary, $1::jsonb)`,
            [JSON.stringify(snapshot.previous_record)],
          );
          restoredSummaries++;
        } else {
          deletedSummaries++;
        }
      }

      await this.markRollbackProgress(client, tenantId, rollbackRun.id, 3);

      const rollbackMetadata = {
        reason: reason ?? null,
        restoredAttendanceRecords,
        deletedAttendanceRecords,
        restoredBreakSessions,
        restoredSummaries,
        deletedSummaries,
      };

      await client.query(
        `UPDATE historical_attendance_import_rollback_runs
         SET status = 'completed',
             completed_steps = total_steps,
             progress_percent = 100,
             restored_attendance_records = $3,
             deleted_attendance_records = $4,
             restored_break_sessions = $5,
             restored_summaries = $6,
             deleted_summaries = $7,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [
          rollbackRun.id,
          tenantId,
          restoredAttendanceRecords,
          deletedAttendanceRecords,
          restoredBreakSessions,
          restoredSummaries,
          deletedSummaries,
        ],
      );

      await client.query(
        `UPDATE historical_attendance_import_commits
         SET status = 'rolled_back',
             rolled_back_by = $3,
             rolled_back_at = now(),
             rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || $4::jsonb,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [currentCommit.id, tenantId, actor.sub, JSON.stringify(rollbackMetadata)],
      );

      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = 'rolled_back',
             rollback_status = 'rolled_back',
             rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [currentCommit.batch_id, tenantId, JSON.stringify(rollbackMetadata)],
      );

      await this.logWithClient(client, tenantId, currentCommit.batch_id, 'info', 'import_rollback_completed', actor.sub, rollbackMetadata);
        return { rollbackRunId: rollbackRun.id, batchId: currentCommit.batch_id, ...rollbackMetadata };
      });
    } catch (error: any) {
      await this.markRollbackFailed(tenantId, commitId, error?.message ?? 'Rollback failed');
      throw error;
    }

    const dependencyRebuild = await this.dependencyRebuildService.rebuildAfterRollback(
      tenantId,
      actor,
      rollbackResult.batchId,
      affectedRanges,
    );

    return { ...rollbackResult, dependencyRebuild };
  }

  private async getCommitForBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_commits
       WHERE tenant_id = $1 AND batch_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, batchId],
    );
    return rows[0] ?? null;
  }

  private async markRollbackFailed(tenantId: string, commitId: string, error: string) {
    await this.db.query(
      `UPDATE historical_attendance_import_commits c
       SET status = 'rollback_failed',
           rollback_error = $3,
           updated_at = now()
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [commitId, tenantId, error],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_batches b
       SET rollback_status = 'failed',
           rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       FROM historical_attendance_import_commits c
       WHERE c.id = $1
         AND c.tenant_id = $2
         AND b.id = c.batch_id
         AND b.tenant_id = c.tenant_id`,
      [commitId, tenantId, JSON.stringify({ error })],
    );
  }

  private async getCommit(tenantId: string, commitId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_commits
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, commitId],
    );
    return rows[0] ?? null;
  }

  private async getSnapshotsWithClient(client: any, tenantId: string, commitId: string): Promise<SnapshotRow[]> {
    const { rows } = await client.query(
      `SELECT *
       FROM historical_attendance_import_commit_snapshots
       WHERE tenant_id = $1 AND commit_id = $2
       ORDER BY
         CASE entity_type
           WHEN 'attendance_record' THEN 1
           WHEN 'break_session' THEN 2
           ELSE 3
         END,
         created_at ASC`,
      [tenantId, commitId],
    );
    return rows;
  }

  private async getAffectedRanges(tenantId: string, commitId: string) {
    const { rows } = await this.db.query(
      `SELECT employee_id,
              COALESCE(e.employee_code, 'Unknown') AS employee_code,
              e.branch_id,
              e.department_id,
              MIN(attendance_date)::date AS date_from,
              MAX(attendance_date)::date AS date_to
       FROM (
         SELECT COALESCE(previous_record->>'employee_id', current_record->>'employee_id', metadata->>'employeeId')::uuid AS employee_id,
                COALESCE(previous_record->>'date', current_record->>'date', metadata->>'date')::date AS attendance_date
         FROM historical_attendance_import_commit_snapshots
         WHERE tenant_id = $1
           AND commit_id = $2
           AND entity_type = 'attendance_record'
       ) affected
       LEFT JOIN employees e ON e.id = affected.employee_id
       WHERE employee_id IS NOT NULL AND attendance_date IS NOT NULL
       GROUP BY employee_id, e.employee_code, e.branch_id, e.department_id
       ORDER BY e.employee_code`,
      [tenantId, commitId],
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

  private async markRollbackProgress(client: any, tenantId: string, rollbackRunId: string, completedSteps: number) {
    await client.query(
      `UPDATE historical_attendance_import_rollback_runs
       SET completed_steps = $3,
           progress_percent = ROUND(($3::numeric / NULLIF(total_steps, 0)::numeric) * 100, 2),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [rollbackRunId, tenantId, completedSteps],
    );
  }

  private async writeAttendanceAuditWithClient(client: any, params: {
    tenantId: string;
    employeeId?: string | null;
    attendanceRecordId?: string | null;
    eventType: string;
    actorId?: string | null;
    beforeState?: Record<string, any> | null;
    afterState?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
  }) {
    await client.query(
      `INSERT INTO attendance_audit_logs
         (tenant_id, employee_id, attendance_record_id, event_type,
          actor_type, actor_id, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, 'system', $5, $6, $7, $8)`,
      [
        params.tenantId,
        params.employeeId ?? null,
        params.attendanceRecordId ?? null,
        params.eventType,
        params.actorId ?? null,
        params.beforeState ? JSON.stringify(params.beforeState) : null,
        params.afterState ? JSON.stringify(params.afterState) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ],
    );
  }

  private async logWithClient(
    client: any,
    tenantId: string,
    batchId: string,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, batchId, level, code, code.replace(/_/g, ' '), JSON.stringify(details), actorUserId],
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

  private toDateString(value: string | Date) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
}
