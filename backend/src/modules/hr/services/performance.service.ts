import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { AttendanceBehaviourEngineService } from './attendance-behaviour-engine.service';
import { AttendanceBehaviourConfigService } from './attendance-behaviour-config.service';
import { PerformanceScoreEngineService } from './performance-score-engine.service';

const TIMELINE_EVENT_LABELS: Record<string, string> = {
  activated: 'Review Cycle Started',
  score_generated: 'Attendance Calculated',
  score_recalculated: 'Attendance Recalculated',
  snapshots_frozen: 'Attendance Frozen',
  attendance_score_overridden: 'Manager Override',
  approved: 'Review Approved',
  locked: 'Review Locked',
};

@Injectable()
export class PerformanceService {
  constructor(
    private db: DatabaseService,
    private readonly auditLog: AuditLogService,
    private readonly attendanceBehaviourEngine: AttendanceBehaviourEngineService,
    private readonly attendanceBehaviourConfig: AttendanceBehaviourConfigService,
    private readonly scoreEngine: PerformanceScoreEngineService,
  ) {}

  async getCycles(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM review_cycles WHERE tenant_id = $1 ORDER BY start_date DESC',
      [tenantId],
    );
    return rows;
  }

  async createCycle(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO review_cycles (tenant_id, name, type, start_date, end_date)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, data.name, data.type, data.start_date, data.end_date],
    );
    return rows[0];
  }

  /**
   * Updating a cycle's status drives the attendance behaviour lifecycle:
   * draft/anything -> active triggers org-wide snapshot generation;
   * -> approved/locked freezes every snapshot (and, for locked, the reviews
   * themselves) so historical figures never change again.
   */
  async updateCycle(id: string, tenantId: string, userId: string, data: any) {
    const { rows: beforeRows } = await this.db.query(
      `SELECT * FROM review_cycles WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!beforeRows.length) throw new NotFoundException('Review cycle not found');
    const before = beforeRows[0];

    const { rows } = await this.db.query(
      `UPDATE review_cycles SET
        status = COALESCE($3, status),
        name = COALESCE($4, name),
        end_date = COALESCE($5, end_date),
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.status || null, data.name || null, data.end_date || null],
    );
    const cycle = rows[0];
    const transitioned = data.status && before.status !== cycle.status;

    if (transitioned && cycle.status === 'active') {
      await this.attendanceBehaviourEngine.generateForCycle(tenantId, id, userId);
      await this.auditLog.log({
        tenantId, userId, entityType: 'review_cycle', entityId: id,
        action: 'activated', oldValues: { status: before.status }, newValues: { status: cycle.status },
      });
    } else if (transitioned && (cycle.status === 'approved' || cycle.status === 'locked')) {
      await this.attendanceBehaviourEngine.freezeSnapshots(tenantId, id, userId);
      if (cycle.status === 'locked') {
        await this.db.query(
          `UPDATE performance_reviews SET locked_at = now(), locked_by = $3
           WHERE tenant_id = $1 AND cycle_id = $2 AND locked_at IS NULL`,
          [tenantId, id, userId],
        );
      }
      await this.auditLog.log({
        tenantId, userId, entityType: 'review_cycle', entityId: id,
        action: cycle.status, oldValues: { status: before.status }, newValues: { status: cycle.status },
      });
    }

    return cycle;
  }

  async getKRAs(tenantId: string, filters: any) {
    const { employee_id, cycle_id } = filters;
    let query = `SELECT k.*, e.first_name, e.last_name, rc.name as cycle_name FROM kras k
      JOIN employees e ON k.employee_id = e.id
      JOIN review_cycles rc ON k.cycle_id = rc.id
      WHERE k.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND k.employee_id = $${idx++}`; params.push(employee_id); }
    if (cycle_id) { query += ` AND k.cycle_id = $${idx++}`; params.push(cycle_id); }
    query += ' ORDER BY e.first_name, k.title';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createKRA(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO kras (tenant_id, employee_id, cycle_id, title, weightage, target)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, data.employee_id, data.cycle_id, data.title, data.weightage || 0, data.target || null],
    );
    return rows[0];
  }

  async updateKRA(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE kras SET
        achievement = COALESCE($3, achievement),
        self_score = COALESCE($4, self_score),
        manager_score = COALESCE($5, manager_score),
        title = COALESCE($6, title),
        weightage = COALESCE($7, weightage),
        target = COALESCE($8, target),
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, data.achievement ?? null, data.self_score ?? null, data.manager_score ?? null,
       data.title ?? null, data.weightage ?? null, data.target ?? null],
    );
    if (!rows.length) throw new NotFoundException('KRA not found');
    return rows[0];
  }

  async getKPIs(tenantId: string, filters: any) {
    const { employee_id, cycle_id } = filters;
    let query = `SELECT k.*, e.first_name, e.last_name, rc.name as cycle_name FROM kpis k
      JOIN employees e ON k.employee_id = e.id
      JOIN review_cycles rc ON k.cycle_id = rc.id
      WHERE k.tenant_id = $1 AND k.deleted_at IS NULL`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND k.employee_id = $${idx++}`; params.push(employee_id); }
    if (cycle_id) { query += ` AND k.cycle_id = $${idx++}`; params.push(cycle_id); }
    query += ' ORDER BY e.first_name, k.title';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createKPI(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO kpis (tenant_id, employee_id, cycle_id, title, unit_type, target_value)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, data.employee_id, data.cycle_id, data.title, data.unit_type || 'number', data.target_value || 0],
    );
    return rows[0];
  }

  async updateKPI(id: string, tenantId: string, data: any) {
    const { rows } = await this.db.query(
      `UPDATE kpis SET
        actual_value = COALESCE($3, actual_value),
        status = COALESCE($4, status),
        title = COALESCE($5, title),
        target_value = COALESCE($6, target_value),
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING *`,
      [id, tenantId, data.actual_value ?? null, data.status ?? null, data.title ?? null, data.target_value ?? null],
    );
    if (!rows.length) throw new NotFoundException('KPI not found');
    return rows[0];
  }

  async deleteKPI(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `UPDATE kpis SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('KPI not found');
  }

  async getReviews(tenantId: string, filters: any) {
    const { employee_id, cycle_id } = filters;
    let query = `SELECT r.*, e.first_name, e.last_name, e.employee_code, rc.name as cycle_name
      FROM performance_reviews r
      JOIN employees e ON r.employee_id = e.id
      JOIN review_cycles rc ON r.cycle_id = rc.id
      WHERE r.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND r.employee_id = $${idx++}`; params.push(employee_id); }
    if (cycle_id) { query += ` AND r.cycle_id = $${idx++}`; params.push(cycle_id); }
    query += ' ORDER BY e.first_name';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createReview(tenantId: string, reviewerId: string, data: any) {
    await this._assertCycleNotLocked(tenantId, data.cycle_id);
    const blend = await this._blendScores(tenantId, data.employee_id, data.cycle_id);

    const { rows } = await this.db.query(
      `INSERT INTO performance_reviews
        (tenant_id, employee_id, cycle_id, reviewer_id, overall_score, rating, status, employee_comments, reviewer_comments,
         kra_score, kpi_score, attendance_score, attendance_snapshot_id, score_breakdown)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
        ON CONFLICT (tenant_id, employee_id, cycle_id) DO UPDATE SET
          overall_score = EXCLUDED.overall_score,
          rating = EXCLUDED.rating,
          reviewer_comments = EXCLUDED.reviewer_comments,
          status = EXCLUDED.status,
          kra_score = EXCLUDED.kra_score,
          kpi_score = EXCLUDED.kpi_score,
          attendance_score = EXCLUDED.attendance_score,
          attendance_snapshot_id = EXCLUDED.attendance_snapshot_id,
          score_breakdown = EXCLUDED.score_breakdown,
          updated_at = now()
        RETURNING *`,
      [
        tenantId, data.employee_id, data.cycle_id, reviewerId,
        data.overall_score ?? blend.overallScore, data.rating ?? blend.rating,
        data.status || 'submitted', data.employee_comments || null, data.reviewer_comments || null,
        blend.kraScore, blend.kpiScore, blend.attendanceScore, blend.attendanceSnapshotId,
        JSON.stringify(blend.breakdown),
      ],
    );
    return rows[0];
  }

  async updateReview(id: string, tenantId: string, userId: string, data: any) {
    const { rows: existingRows } = await this.db.query(
      `SELECT * FROM performance_reviews WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!existingRows.length) throw new NotFoundException('Review not found');
    const existing = existingRows[0];
    if (existing.locked_at) throw new ForbiddenException('This review is locked and can no longer be modified');
    await this._assertCycleNotLocked(tenantId, existing.cycle_id);

    const blend = await this._blendScores(tenantId, existing.employee_id, existing.cycle_id);

    const { rows } = await this.db.query(
      `UPDATE performance_reviews SET
        status = COALESCE($3, status),
        overall_score = COALESCE($4, $9),
        rating = COALESCE($5, $10),
        reviewer_comments = COALESCE($6, reviewer_comments),
        kra_score = $11, kpi_score = $12, attendance_score = $13,
        attendance_snapshot_id = $14, score_breakdown = $15::jsonb,
        updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        id, tenantId, data.status ?? null, data.overall_score ?? null, data.rating ?? null, data.reviewer_comments ?? null,
        null, null, blend.overallScore, blend.rating,
        blend.kraScore, blend.kpiScore, blend.attendanceScore, blend.attendanceSnapshotId, JSON.stringify(blend.breakdown),
      ],
    );

    if (data.status === 'approved' && existing.status !== 'approved') {
      await this.auditLog.log({
        tenantId, userId, entityType: 'performance_review', entityId: id,
        action: 'approved', oldValues: { status: existing.status }, newValues: { status: 'approved' },
      });
    }

    return rows[0];
  }

  /**
   * Manager override of the attendance component on a review. The snapshot
   * itself is never touched — only the review's effective attendance_score
   * (and, in turn, overall_score) changes. Requires a reason and is blocked
   * once the review/cycle is locked.
   */
  async overrideAttendanceScore(tenantId: string, reviewId: string, userId: string, adjustedScore: number, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('An override reason is required');
    if (adjustedScore < 0 || adjustedScore > 100) throw new BadRequestException('Adjusted score must be between 0 and 100');

    const { rows: existingRows } = await this.db.query(
      `SELECT * FROM performance_reviews WHERE id = $1 AND tenant_id = $2`,
      [reviewId, tenantId],
    );
    if (!existingRows.length) throw new NotFoundException('Review not found');
    const existing = existingRows[0];
    if (existing.locked_at) throw new ForbiddenException('This review is locked and can no longer be modified');
    await this._assertCycleNotLocked(tenantId, existing.cycle_id);

    const originalScore = existing.attendance_score_overridden ? existing.attendance_score_original : existing.attendance_score;
    const configRow = await this.attendanceBehaviourConfig.getConfig(tenantId);
    const overall = this.scoreEngine.computeOverallScore(
      existing.kra_score, existing.kpi_score, adjustedScore,
      configRow.config.overallWeights, configRow.config.ratingBuckets,
    );

    const { rows } = await this.db.query(
      `UPDATE performance_reviews SET
        attendance_score = $3, attendance_score_original = $4, attendance_score_overridden = true,
        attendance_override_reason = $5, attendance_override_by = $6, attendance_override_at = now(),
        overall_score = $7, rating = $8, score_breakdown = $9::jsonb, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        reviewId, tenantId, adjustedScore, originalScore, reason.trim(), userId,
        overall.overallScore, overall.rating, JSON.stringify({ ...overall, overrideReason: reason.trim() }),
      ],
    );

    await this.auditLog.log({
      tenantId, userId, entityType: 'performance_review', entityId: reviewId,
      action: 'attendance_score_overridden',
      oldValues: { attendance_score: existing.attendance_score },
      newValues: { attendance_score: adjustedScore, reason: reason.trim() },
    });

    return rows[0];
  }

  /**
   * Chronological event feed for one employee's cycle — Review Cycle
   * Started, Attendance Calculated/Recalculated/Frozen, Override, Approved,
   * Locked. Built entirely from the existing audit_logs table.
   */
  async getPerformanceTimeline(tenantId: string, employeeId: string, cycleId: string) {
    const [cycleEvents, snapshotEvents, reviewEvents] = await Promise.all([
      this.db.query(
        `SELECT * FROM audit_logs WHERE tenant_id = $1 AND entity_type = 'review_cycle' AND entity_id = $2 ORDER BY created_at`,
        [tenantId, cycleId],
      ),
      this.db.query(
        `SELECT al.* FROM audit_logs al
         JOIN attendance_performance_snapshots s ON s.id = al.entity_id
         WHERE al.tenant_id = $1 AND al.entity_type = 'attendance_performance_snapshot'
           AND s.tenant_id = $1 AND s.employee_id = $2 AND s.cycle_id = $3
         ORDER BY al.created_at`,
        [tenantId, employeeId, cycleId],
      ),
      this.db.query(
        `SELECT al.* FROM audit_logs al
         JOIN performance_reviews r ON r.id = al.entity_id
         WHERE al.tenant_id = $1 AND al.entity_type = 'performance_review'
           AND r.tenant_id = $1 AND r.employee_id = $2 AND r.cycle_id = $3
         ORDER BY al.created_at`,
        [tenantId, employeeId, cycleId],
      ),
    ]);

    const all = [...cycleEvents.rows, ...snapshotEvents.rows, ...reviewEvents.rows]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return all.map((row) => ({
      action: row.action,
      label: TIMELINE_EVENT_LABELS[row.action] ?? row.action,
      created_at: row.created_at,
      user_id: row.user_id,
      details: row.new_values,
    }));
  }

  private async _assertCycleNotLocked(tenantId: string, cycleId: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT status FROM review_cycles WHERE id = $1 AND tenant_id = $2`,
      [cycleId, tenantId],
    );
    if (rows.length && rows[0].status === 'locked') {
      throw new ForbiddenException('This review cycle is locked and reviews can no longer be modified');
    }
  }

  private async _blendScores(tenantId: string, employeeId: string, cycleId: string) {
    const [kraScore, kpiScore, snapshotRows, configRow] = await Promise.all([
      this.scoreEngine.computeKraScore(tenantId, employeeId, cycleId),
      this.scoreEngine.computeKpiScore(tenantId, employeeId, cycleId),
      this.db.query(
        `SELECT id, behaviour_score FROM attendance_performance_snapshots WHERE tenant_id = $1 AND employee_id = $2 AND cycle_id = $3`,
        [tenantId, employeeId, cycleId],
      ),
      this.attendanceBehaviourConfig.getConfig(tenantId),
    ]);

    const snapshot = snapshotRows.rows[0] ?? null;
    const attendanceScore = snapshot ? Number(snapshot.behaviour_score) : null;
    const overall = this.scoreEngine.computeOverallScore(
      kraScore, kpiScore, attendanceScore, configRow.config.overallWeights, configRow.config.ratingBuckets,
    );

    return {
      kraScore, kpiScore, attendanceScore,
      attendanceSnapshotId: snapshot?.id ?? null,
      overallScore: overall.overallScore, rating: overall.rating,
      breakdown: overall,
    };
  }
}
