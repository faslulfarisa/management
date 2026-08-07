import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { TemplateService } from '../../platform/services/template.service';
import {
  DEFAULT_BREAK_LIMITS,
  getPunchOutReason,
} from '../constants/punch-out-reasons';

export interface BreakLimit {
  allowed_minutes: number | null;
  paid: boolean;
}

@Injectable()
export class BreakSessionService {
  constructor(
    private db: DatabaseService,
    private templateService: TemplateService,
  ) {}

  /**
   * Resolve per-break-type allowed durations for an employee from the
   * 'break_policy' template (employee → designation → department →
   * property → tenant default cascade via TemplateService.getResolved).
   * Falls back to DEFAULT_BREAK_LIMITS when no template is configured.
   */
  async getResolvedLimits(tenantId: string, employeeId: string): Promise<Record<string, BreakLimit>> {
    const template = await this.templateService.getResolved(tenantId, 'break_policy', 'employee', employeeId);
    const limits = template?.config?.limits;
    if (limits && typeof limits === 'object') {
      return { ...DEFAULT_BREAK_LIMITS, ...limits };
    }
    return DEFAULT_BREAK_LIMITS;
  }

  async getActiveBreak(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM break_sessions WHERE tenant_id = $1 AND employee_id = $2 AND status = 'active'`,
      [tenantId, employeeId],
    );
    return rows[0] ?? null;
  }

  async getTodayBreaks(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `SELECT * FROM break_sessions WHERE tenant_id = $1 AND employee_id = $2 AND date = $3 ORDER BY started_at ASC`,
      [tenantId, employeeId, today],
    );
    return rows;
  }

  /**
   * Start a break/temporary punch-out session. Does NOT touch
   * attendance_records.clock_out — the attendance session stays active.
   */
  async startBreak(tenantId: string, employeeId: string, reasonCode: string, note?: string) {
    const reason = getPunchOutReason(reasonCode);
    if (!reason) throw new BadRequestException('Invalid punch-out reason');
    if (reason.category === 'final_logout') {
      throw new BadRequestException('This reason ends the attendance session and cannot start a break');
    }

    const today = new Date().toISOString().split('T')[0];
    const { rows: attRows } = await this.db.query(
      `SELECT * FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, today],
    );
    const attendance = attRows[0];
    if (!attendance || !attendance.clock_in) {
      throw new BadRequestException('No active clock-in found for today');
    }
    if (attendance.clock_out) {
      throw new BadRequestException('Attendance for today is already closed');
    }
    if (attendance.is_on_break) {
      throw new BadRequestException('A break is already in progress');
    }

    const limits = await this.getResolvedLimits(tenantId, employeeId);
    const limit = limits[reasonCode] ?? { allowed_minutes: null, paid: false };

    const { rows: breakRows } = await this.db.query(
      `INSERT INTO break_sessions (
         tenant_id, employee_id, attendance_record_id, date,
         break_code, category, reason_label, note,
         allowed_minutes, is_paid
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId, employeeId, attendance.id, today,
        reasonCode, reason.category, reason.label, note ?? null,
        limit.allowed_minutes, limit.paid,
      ],
    );
    const breakSession = breakRows[0];

    await this.db.query(
      `UPDATE attendance_records SET
         is_on_break = true,
         current_break_session_id = $3,
         last_punch_out_reason_code = $4,
         last_punch_out_note = $5,
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [attendance.id, tenantId, breakSession.id, reasonCode, note ?? null],
    );

    if (reason.category === 'emergency') {
      await this.db.query(
        `INSERT INTO attendance_requests (tenant_id, employee_id, date, request_type, reason)
         VALUES ($1, $2, $3, 'emergency_leave', $4)`,
        [tenantId, employeeId, today, note ? `Emergency leave: ${note}` : 'Emergency leave'],
      );
    }

    return this.getTodayStatus(tenantId, employeeId);
  }

  /**
   * End the active break/temporary punch-out session and resume the
   * attendance session. Computes duration and any overdue minutes against
   * the allowance snapshotted at break start.
   */
  async endBreak(tenantId: string, employeeId: string) {
    const active = await this.getActiveBreak(tenantId, employeeId);
    if (!active) throw new NotFoundException('No active break session found');

    return this._closeBreakSession(tenantId, active);
  }

  /**
   * Internal helper used by endBreak() and by AttendanceService.clockOut()
   * as a safety net when the employee finishes the day without explicitly
   * returning from a break.
   */
  async _closeBreakSession(tenantId: string, breakSession: any) {
    const endedAt = new Date();
    const startedAt = new Date(breakSession.started_at);
    const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    const allowed = breakSession.allowed_minutes;
    const overdueMinutes = allowed != null ? Math.max(0, durationMinutes - allowed) : 0;
    const isOverdue = overdueMinutes > 0;

    await this.db.query(
      `UPDATE break_sessions SET
         status = 'completed',
         ended_at = $3,
         duration_minutes = $4,
         overdue_minutes = $5,
         is_overdue = $6,
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [breakSession.id, tenantId, endedAt.toISOString(), durationMinutes, overdueMinutes, isOverdue],
    );

    await this.db.query(
      `UPDATE attendance_records SET
         is_on_break = false,
         current_break_session_id = NULL,
         total_break_minutes = COALESCE(total_break_minutes, 0) + $3,
         unpaid_break_minutes = COALESCE(unpaid_break_minutes, 0) + CASE WHEN $4 THEN 0 ELSE $3 END,
         total_overdue_break_minutes = COALESCE(total_overdue_break_minutes, 0) + $5,
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [breakSession.attendance_record_id, tenantId, durationMinutes, breakSession.is_paid, overdueMinutes],
    );

    return this.getTodayStatus(tenantId, breakSession.employee_id);
  }

  /**
   * Today's attendance status merged with current/active break info.
   * Returned to the employee punch endpoints after start/end break.
   */
  async getTodayStatus(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `SELECT *, (clock_in IS NOT NULL AND clock_out IS NULL) AS is_punched_in
       FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, today],
    );
    const record = rows[0] ?? null;
    if (!record) return record;

    if (record.is_on_break && record.current_break_session_id) {
      const { rows: bRows } = await this.db.query(
        `SELECT * FROM break_sessions WHERE id = $1 AND tenant_id = $2`,
        [record.current_break_session_id, tenantId],
      );
      record.current_break = bRows[0] ?? null;
    } else {
      record.current_break = null;
    }
    return record;
  }

  /**
   * Active breaks across the tenant (optionally scoped to a branch) for
   * manager/HR monitoring dashboards.
   */
  async getActiveBreaksForTenant(tenantId: string, filters: { branch_id?: string } = {}) {
    let query = `
      SELECT bs.*, e.first_name, e.last_name, e.employee_code, e.branch_id,
             EXTRACT(EPOCH FROM (now() - bs.started_at)) / 60 AS elapsed_minutes
      FROM break_sessions bs
      JOIN employees e ON bs.employee_id = e.id
      WHERE bs.tenant_id = $1 AND bs.status = 'active'`;
    const params: any[] = [tenantId];
    if (filters.branch_id) {
      query += ` AND e.branch_id = $${params.length + 1}`;
      params.push(filters.branch_id);
    }
    query += ' ORDER BY bs.started_at ASC';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  /**
   * Overdue/violation history within a date range for reporting and the
   * repeated-abuse view.
   */
  async getViolations(tenantId: string, filters: { date_from?: string; date_to?: string; employee_id?: string; branch_id?: string } = {}) {
    let query = `
      SELECT bs.*, e.first_name, e.last_name, e.employee_code, e.branch_id
      FROM break_sessions bs
      JOIN employees e ON bs.employee_id = e.id
      WHERE bs.tenant_id = $1 AND bs.is_overdue = true`;
    const params: any[] = [tenantId];
    if (filters.date_from) { query += ` AND bs.date >= $${params.length + 1}`; params.push(filters.date_from); }
    if (filters.date_to) { query += ` AND bs.date <= $${params.length + 1}`; params.push(filters.date_to); }
    if (filters.employee_id) { query += ` AND bs.employee_id = $${params.length + 1}`; params.push(filters.employee_id); }
    if (filters.branch_id) { query += ` AND e.branch_id = $${params.length + 1}`; params.push(filters.branch_id); }
    query += ' ORDER BY bs.date DESC, bs.started_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows;
  }
}
