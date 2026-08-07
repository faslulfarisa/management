import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { BreakSessionService } from './break-session.service';

@Injectable()
export class AttendanceService {
  constructor(
    private db: DatabaseService,
    private breakSessionService: BreakSessionService,
  ) {}

  async findAll(tenantId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, date_from, date_to, status, branch_id, accessScope = GLOBAL_ACCESS_SCOPE as AccessScope } = filters;
    let query = `SELECT a.id, a.tenant_id, a.employee_id, a.date, a.clock_in, a.clock_out, a.status, a.late_minutes, a.overtime_minutes, a.remarks, a.location, a.branch_id, a.created_at, a.updated_at, e.first_name, e.last_name, e.employee_code FROM attendance_records a
      JOIN employees e ON a.employee_id = e.id WHERE a.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (employee_id) { query += ` AND a.employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND a.date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND a.date <= $${idx++}`; params.push(date_to); }
    if (status) { query += ` AND a.status = $${idx++}`; params.push(status); }
    if (branch_id) { query += ` AND a.branch_id = $${idx++}`; params.push(branch_id); }
    {
      const scopeClause = branchScopeClause(accessScope, 'a.branch_id', idx);
      query += ` AND ${scopeClause.clause}`; params.push(...scopeClause.params); idx += scopeClause.params.length;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY a.date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM attendance_records WHERE tenant_id = $1';
    const countParams: any[] = [tenantId];
    let cIdx = 2;
    if (employee_id) { countQuery += ` AND employee_id = $${cIdx++}`; countParams.push(employee_id); }
    if (date_from) { countQuery += ` AND date >= $${cIdx++}`; countParams.push(date_from); }
    if (date_to) { countQuery += ` AND date <= $${cIdx++}`; countParams.push(date_to); }
    if (status) { countQuery += ` AND status = $${cIdx++}`; countParams.push(status); }
    if (branch_id) { countQuery += ` AND branch_id = $${cIdx++}`; countParams.push(branch_id); }
    {
      const scopeClause = branchScopeClause(accessScope, 'branch_id', cIdx);
      countQuery += ` AND ${scopeClause.clause}`; countParams.push(...scopeClause.params); cIdx += scopeClause.params.length;
    }

    const { rows: countRows } = await this.db.query(countQuery, countParams);
    const total = parseInt(countRows[0].count);

    return { data: rows, meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) } };
  }

  async clockIn(tenantId: string, employeeId: string, data: any) {
    const today = new Date().toISOString().split('T')[0];
    const { rows: empRows } = await this.db.query(
      'SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );
    const branchId = empRows[0]?.branch_id ?? null;
    const { rows } = await this.db.query(
      `INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in, status, location, branch_id)
        VALUES ($1, $2, $3, now(), 'present', $4, $5)
        ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET clock_in = now(), updated_at = now()
        RETURNING *`,
      [tenantId, employeeId, today, JSON.stringify(data.location || {}), branchId],
    );
    return rows[0];
  }

  async clockOut(tenantId: string, employeeId: string, reason?: { reason_code?: string; note?: string }) {
    // Safety net: if the employee forgot to "return" from a break, close it
    // now (no overdue alert) so break_sessions/attendance_records stay consistent.
    const activeBreak = await this.breakSessionService.getActiveBreak(tenantId, employeeId);
    if (activeBreak) {
      await this.breakSessionService._closeBreakSession(tenantId, activeBreak);
    }

    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `UPDATE attendance_records SET
         clock_out = now(),
         last_punch_out_reason_code = COALESCE($4, last_punch_out_reason_code),
         last_punch_out_note = COALESCE($5, last_punch_out_note),
         updated_at = now()
        WHERE tenant_id = $1 AND employee_id = $2 AND date = $3 RETURNING *`,
      [tenantId, employeeId, today, reason?.reason_code ?? null, reason?.note ?? null],
    );
    if (!rows.length) throw new NotFoundException('No clock-in record found for today');
    return rows[0];
  }

  async getTodayStatus(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `SELECT *, (clock_in IS NOT NULL AND clock_out IS NULL) AS is_punched_in
       FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, today],
    );
    return rows[0] || null;
  }

  async getSummary(tenantId: string, filters: any) {
    const { employee_id, date_from, date_to, branch_id } = filters;
    let query = `SELECT status, COUNT(*) as count FROM attendance_records WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (employee_id) { query += ` AND employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { query += ` AND branch_id = $${idx++}`; params.push(branch_id); }
    query += ' GROUP BY status';

    const { rows } = await this.db.query(query, params);

    // Calculate absent dynamically
    let empQuery = `SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'active'`;
    const empParams: any[] = [tenantId];
    let eIdx = 2;
    if (branch_id) { empQuery += ` AND branch_id = $${eIdx++}`; empParams.push(branch_id); }
    if (employee_id) { empQuery += ` AND id = $${eIdx++}`; empParams.push(employee_id); }
    const { rows: empRows } = await this.db.query(empQuery, empParams);
    const totalActiveEmployees = parseInt(empRows[0].count);

    let presentCount = 0;
    const presentRow = rows.find(r => r.status === 'present');
    if (presentRow) presentCount += parseInt(presentRow.count);
    const lateRow = rows.find(r => r.status === 'late');
    if (lateRow) presentCount += parseInt(lateRow.count);
    const halfDayRow = rows.find(r => r.status === 'half_day');
    if (halfDayRow) presentCount += parseInt(halfDayRow.count);

    let absentCount = totalActiveEmployees - presentCount;
    if (absentCount < 0) absentCount = 0;

    const absentRowIndex = rows.findIndex(r => r.status === 'absent');
    if (absentRowIndex >= 0) {
      rows[absentRowIndex].count = absentCount.toString();
    } else {
      rows.push({ status: 'absent', count: absentCount.toString() });
    }

    return rows;
  }

  async getRequests(tenantId: string, filters: any) {
    const { page = 1, limit = 20, status } = filters;
    let query = `SELECT ar.*, e.first_name, e.last_name, e.employee_code FROM attendance_requests ar
      JOIN employees e ON ar.employee_id = e.id WHERE ar.tenant_id = $1`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (status) { query += ` AND ar.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ar.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async createRequest(tenantId: string, employeeId: string, data: any) {
    const { rows } = await this.db.query(
      `INSERT INTO attendance_requests (tenant_id, employee_id, date, request_type, reason)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, employeeId, data.date, data.request_type, data.reason],
    );
    return rows[0];
  }

  async approveRequest(id: string, tenantId: string, approvedBy: string) {
    const { rows } = await this.db.query(
      `UPDATE attendance_requests SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $3 RETURNING *`,
      [id, approvedBy, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Request not found');
    return rows[0];
  }

  async rejectRequest(id: string, tenantId: string, rejectionReason?: string) {
    const { rows } = await this.db.query(
      `UPDATE attendance_requests SET status = 'rejected', reason = COALESCE($3, reason), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, rejectionReason],
    );
    if (!rows.length) throw new NotFoundException('Request not found');
    return rows[0];
  }
}
