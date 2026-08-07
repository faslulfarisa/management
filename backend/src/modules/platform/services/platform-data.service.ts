import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ATTENDANCE_WORKFORCE_STATUS_SQL, EMPLOYEE_STATUSES } from '../../../shared/employee-status.constants';
import { mapAttendanceStatus } from '../../../shared/attendance-status.util';
import { attendanceFilterSql } from '../../../shared/attendance-filter.util';
import { AuditLogService } from './audit-log.service';
import {
  AttendanceSource,
  PunchDirection,
  PunchEventDto,
  VerifyMethod,
} from '../../biometrics/dto/punch-event.dto';
import { AttendanceEngineService } from '../../biometrics/engine/attendance-engine.service';

@Injectable()
export class PlatformDataService {
  constructor(
    private db: DatabaseService,
    private auditLogService: AuditLogService,
    private attendanceEngine: AttendanceEngineService,
  ) {}

  async getAllOrgsStats(orgIds?: string[]) {
    const today = new Date().toISOString().split('T')[0];
    const hasOrgFilter = !!orgIds?.length;

    const tenantParams: any[] = [];
    let tenantWhere = 'deleted_at IS NULL';
    if (hasOrgFilter) {
      tenantParams.push(orgIds);
      tenantWhere += ` AND id = ANY($${tenantParams.length})`;
    }

    const { rows: orgs } = await this.db.query(
      `SELECT id, name, slug, status, emp_code_prefix, timezone, created_at
       FROM tenants WHERE ${tenantWhere} ORDER BY created_at DESC`,
      tenantParams,
    );

    const empParams: any[] = [];
    let empWhere = 'deleted_at IS NULL';
    if (hasOrgFilter) {
      empParams.push(orgIds);
      empWhere += ` AND tenant_id = ANY($${empParams.length})`;
    }

    const attParams: any[] = [today];
    let attWhere = `ar.date = $1
           AND ar.clock_in IS NOT NULL
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`;
    if (hasOrgFilter) {
      attParams.push(orgIds);
      attWhere += ` AND ar.tenant_id = ANY($${attParams.length})`;
    }

    const [empRes, attRes] = await Promise.all([
      this.db.query(
        `SELECT tenant_id, COUNT(*) as total
         FROM employees WHERE ${empWhere} GROUP BY tenant_id`,
        empParams,
      ),
      this.db.query(
        `SELECT ar.tenant_id, COUNT(DISTINCT ar.employee_id) as present
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ${attWhere}
         GROUP BY ar.tenant_id`,
        attParams,
      ),
    ]);

    const empMap: Record<string, number> = {};
    for (const r of empRes.rows) empMap[r.tenant_id] = parseInt(r.total);

    const attMap: Record<string, number> = {};
    for (const r of attRes.rows) attMap[r.tenant_id] = parseInt(r.present);

    return orgs.map(org => ({
      ...org,
      total_employees: empMap[org.id] ?? 0,
      present_today: attMap[org.id] ?? 0,
    }));
  }

  async getOrgStats(orgId: string) {
    const { rows: orgRows } = await this.db.query(
      'SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL',
      [orgId],
    );
    if (!orgRows.length) throw new NotFoundException('Organization not found');

    const today = new Date().toISOString().split('T')[0];

    const [empRes, attendanceWorkforceRes, attTodayRes, presentTodayRes, punchedInRes, absentTodayRes, lateTodayRes, earlyLeaveTodayRes, deptRes, recentRes] = await Promise.all([
      this.db.query(
        `SELECT status, COUNT(*) as count FROM employees
         WHERE tenant_id = $1 AND deleted_at IS NULL GROUP BY status`,
        [orgId],
      ),
      this.db.query(
        `SELECT COUNT(*) as total FROM employees
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`,
        [orgId],
      ),
      this.db.query(
        `SELECT ar.status, COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = $2
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
         GROUP BY ar.status`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = $2 AND ar.clock_in IS NOT NULL
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = $2 AND ar.clock_in IS NOT NULL AND ar.clock_out IS NULL
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND NOT EXISTS (
             SELECT 1 FROM attendance_records ar
             WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
               AND ar.date = $2 AND ar.clock_in IS NOT NULL
           )`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = $2 AND ar.late_minutes > 0
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT employee_id) as count FROM (
           SELECT lr.employee_id
           FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
           WHERE lr.tenant_id = $1 AND lr.status = 'approved' AND lr.days = 0.5
             AND $2::date BETWEEN lr.start_date AND lr.end_date
             AND e.deleted_at IS NULL
             AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           UNION
           SELECT ar.employee_id
           FROM attendance_records ar
           JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
           LEFT JOIN shift_assignments sa ON sa.tenant_id = ar.tenant_id AND sa.employee_id = ar.employee_id
             AND sa.is_active = true AND sa.start_date <= ar.date AND (sa.end_date IS NULL OR sa.end_date >= ar.date)
           LEFT JOIN shift_definitions sd ON sd.id = sa.shift_id
           WHERE ar.tenant_id = $1 AND ar.date = $2 AND ar.clock_in IS NOT NULL
             AND e.deleted_at IS NULL
             AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
             AND (ar.clock_in AT TIME ZONE 'UTC')::time > COALESCE(sd.start_time + (sd.end_time - sd.start_time) / 2, TIME '12:00:00')
         ) early_leave_employees`,
        [orgId, today],
      ),
      this.db.query(
        `SELECT d.name, COUNT(e.id) as count FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.deleted_at IS NULL
         WHERE d.tenant_id = $1 GROUP BY d.name ORDER BY count DESC LIMIT 8`,
        [orgId],
      ),
      this.db.query(
        `SELECT first_name, last_name, date_of_joining FROM employees
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY date_of_joining DESC LIMIT 5`,
        [orgId],
      ),
    ]);

    const empByStatus: Record<string, number> = {};
    let totalEmployees = 0;
    for (const r of empRes.rows) {
      empByStatus[r.status] = parseInt(r.count);
      totalEmployees += parseInt(r.count);
    }

    const attByStatus: Record<string, number> = {};
    for (const r of attTodayRes.rows) attByStatus[r.status] = parseInt(r.count);

    return {
      org: orgRows[0],
      total_employees: totalEmployees,
      attendance_workforce_total: parseInt(attendanceWorkforceRes.rows[0].total),
      present_today: parseInt(presentTodayRes.rows[0].count),
      employees_by_status: empByStatus,
      attendance_today: attByStatus,
      currently_punched_in: parseInt(punchedInRes.rows[0].count),
      absent_today: parseInt(absentTodayRes.rows[0].count),
      late_arrivals_today: parseInt(lateTodayRes.rows[0].count),
      early_leave_today: parseInt(earlyLeaveTodayRes.rows[0].count),
      departments: deptRes.rows.map(r => ({ name: r.name, count: parseInt(r.count) })),
      recent_joiners: recentRes.rows,
    };
  }

  async getOrgEmployees(orgId: string, filters: any) {
    const { page = 1, limit = 20, department_id, status, search, attendance } = filters;
    const attendanceClause = attendanceFilterSql(attendance);

    let query = `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.status,
      e.personal_email, e.personal_phone, e.date_of_joining, e.created_at,
      d.name as department_name, pos.name as position_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions pos ON e.position_id = pos.id
      WHERE e.tenant_id = $1 AND e.deleted_at IS NULL`;
    const params: any[] = [orgId];
    let idx = 2;

    if (department_id) { query += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (status) { query += ` AND e.status = $${idx++}`; params.push(status); }
    if (search) {
      query += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (attendanceClause) query += ` AND ${attendanceClause}`;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY e.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM employees e WHERE e.tenant_id = $1 AND e.deleted_at IS NULL';
    const countParams: any[] = [orgId];
    let cIdx = 2;
    if (department_id) { countQuery += ` AND e.department_id = $${cIdx++}`; countParams.push(department_id); }
    if (status) { countQuery += ` AND e.status = $${cIdx++}`; countParams.push(status); }
    if (search) {
      countQuery += ` AND (e.first_name ILIKE $${cIdx} OR e.last_name ILIKE $${cIdx} OR e.employee_code ILIKE $${cIdx})`;
      countParams.push(`%${search}%`); cIdx++;
    }
    if (attendanceClause) countQuery += ` AND ${attendanceClause}`;

    const { rows: countRows } = await this.db.query(countQuery, countParams);
    const total = parseInt(countRows[0].count);

    const liveStatusMap = await this.getLiveAttendanceStatusMap(orgId, rows.map(r => r.id));
    const data = rows.map(r => ({ ...r, live_status: liveStatusMap[r.id] ?? mapAttendanceStatus(null) }));

    return {
      data,
      meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) },
    };
  }

  private async getLiveAttendanceStatusMap(orgId: string, employeeIds: string[]) {
    const map: Record<string, ReturnType<typeof mapAttendanceStatus>> = {};
    if (!employeeIds.length) return map;

    const today = new Date().toISOString().split('T')[0];
    const { rows } = await this.db.query(
      `SELECT a.employee_id, a.clock_in, a.clock_out, a.status, a.late_minutes, a.is_on_break,
              bs.reason_label AS break_reason_label
       FROM attendance_records a
       LEFT JOIN break_sessions bs ON bs.id = a.current_break_session_id
       WHERE a.tenant_id = $1 AND a.date = $2 AND a.employee_id = ANY($3)`,
      [orgId, today, employeeIds],
    );

    for (const r of rows) {
      map[r.employee_id] = mapAttendanceStatus({
        ...r,
        current_break: r.is_on_break ? { reason_label: r.break_reason_label } : null,
      });
    }
    return map;
  }

  async updateOrgEmployeeStatus(orgId: string, empId: string, newStatus: string, changedById: string) {
    if (!(EMPLOYEE_STATUSES as readonly string[]).includes(newStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${EMPLOYEE_STATUSES.join(', ')}`);
    }

    const { rows } = await this.db.query(
      'SELECT status FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [empId, orgId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found in this organization');
    const oldStatus = rows[0].status;

    const { rows: updated } = await this.db.query(
      'UPDATE employees SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [empId, orgId, newStatus],
    );

    await this.db.query(
      `INSERT INTO employee_lifecycle_events (tenant_id, employee_id, event_type, effective_date, old_values, new_values, created_by)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6)`,
      [orgId, empId, 'status_change', JSON.stringify({ status: oldStatus }), JSON.stringify({ status: newStatus }), changedById],
    );

    await this.auditLogService.log({
      tenantId: orgId,
      userId: changedById,
      entityType: 'employee',
      entityId: empId,
      action: 'employee_status_changed',
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
    });

    return updated[0];
  }

  async getOrgEmployeeAttendanceStatus(orgId: string, empId: string, requestedById: string) {
    const { rows } = await this.db.query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [empId, orgId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found in this organization');

    const today = new Date().toISOString().split('T')[0];
    const { rows: attRows } = await this.db.query(
      `SELECT *, (clock_in IS NOT NULL AND clock_out IS NULL) AS is_punched_in
       FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [orgId, empId, today],
    );
    const result = mapAttendanceStatus(attRows[0] ?? null);

    await this.auditLogService.log({
      tenantId: orgId,
      userId: requestedById,
      entityType: 'employee',
      entityId: empId,
      action: 'employee_attendance_status_checked',
      newValues: { status: result.code, checkedAt: new Date().toISOString() },
    });

    return result;
  }

  async deleteOrgEmployee(orgId: string, empId: string) {
    const { rows } = await this.db.query(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [empId, orgId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found in this organization');

    // Block deletion if this employee is a reporting manager for others
    const { rows: reports } = await this.db.query(
      'SELECT COUNT(*) as count FROM employees WHERE reporting_manager_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [empId, orgId],
    );
    if (parseInt(reports[0].count) > 0) {
      throw new BadRequestException(
        `Cannot delete: ${reports[0].count} employee(s) report to this person. Reassign their reporting manager first.`,
      );
    }

    await this.db.query(
      'UPDATE employees SET deleted_at = now(), status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2',
      [empId, orgId, 'inactive'],
    );
    return { success: true };
  }

  async getOrgAttendance(orgId: string, filters: any) {
    const { page = 1, limit = 20, employee_id, date_from, date_to, status } = filters;

    let query = `SELECT a.id, a.employee_id, a.date, a.clock_in, a.clock_out, a.status,
      a.late_minutes, a.overtime_minutes, a.remarks, a.created_at,
      e.first_name, e.last_name, e.employee_code
      FROM attendance_records a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.tenant_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;

    if (employee_id) { query += ` AND a.employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND a.date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND a.date <= $${idx++}`; params.push(date_to); }
    if (status) { query += ` AND a.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY a.date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM attendance_records WHERE tenant_id = $1';
    const countParams: any[] = [orgId];
    let cIdx = 2;
    if (employee_id) { countQuery += ` AND employee_id = $${cIdx++}`; countParams.push(employee_id); }
    if (date_from) { countQuery += ` AND date >= $${cIdx++}`; countParams.push(date_from); }
    if (date_to) { countQuery += ` AND date <= $${cIdx++}`; countParams.push(date_to); }
    if (status) { countQuery += ` AND status = $${cIdx++}`; countParams.push(status); }

    const { rows: countRows } = await this.db.query(countQuery, countParams);
    const total = parseInt(countRows[0].count);

    return {
      data: rows,
      meta: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / parseInt(limit)) },
    };
  }

  async getOrgAttendanceSummary(orgId: string, filters: any) {
    const { employee_id, date_from, date_to } = filters;
    let query = `SELECT status, COUNT(*) as count FROM attendance_records WHERE tenant_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (employee_id) { query += ` AND employee_id = $${idx++}`; params.push(employee_id); }
    if (date_from) { query += ` AND date >= $${idx++}`; params.push(date_from); }
    if (date_to) { query += ` AND date <= $${idx++}`; params.push(date_to); }
    query += ' GROUP BY status';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async getOrgAttendanceRequests(orgId: string, filters: any) {
    const { page = 1, limit = 20, status } = filters;
    let query = `SELECT ar.*, e.first_name, e.last_name, e.employee_code FROM attendance_requests ar
      JOIN employees e ON ar.employee_id = e.id WHERE ar.tenant_id = $1`;
    const params: any[] = [orgId];
    let idx = 2;
    if (status) { query += ` AND ar.status = $${idx++}`; params.push(status); }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY ar.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), offset);

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async approveOrgAttendanceRequest(orgId: string, requestId: string, approvedById: string) {
    const request = await this.db.transaction(async (client) => {
      const { rows: requestRows } = await client.query(
        `SELECT ar.*, e.branch_id
         FROM attendance_requests ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.id = $1 AND ar.tenant_id = $2
         FOR UPDATE`,
        [requestId, orgId],
      );
      const row = requestRows[0];
      if (!row) throw new NotFoundException('Request not found');
      if (row.status !== 'pending') {
        throw new BadRequestException(`Cannot approve a request with status '${row.status}'`);
      }

      const applied = await this.applyApprovedAttendanceCorrection(client, row);
      const { rows } = await client.query(
        `UPDATE attendance_requests
         SET status = 'approved',
             approved_by = $2,
             approved_at = now(),
             applied_at = CASE WHEN $4::boolean THEN now() ELSE applied_at END,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $3
         RETURNING *`,
        [requestId, approvedById, orgId, applied],
      );
      return rows[0];
    });

    await this.auditLogService.log({
      tenantId: orgId,
      userId: approvedById,
      entityType: 'attendance_request',
      entityId: requestId,
      action: 'attendance_request_approved',
    });

    return request;
  }

  async rejectOrgAttendanceRequest(orgId: string, requestId: string, rejectedById: string, reason?: string) {
    const { rows } = await this.db.query(
      `UPDATE attendance_requests SET status = 'rejected', reason = COALESCE($3, reason), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [requestId, orgId, reason],
    );
    if (!rows.length) throw new NotFoundException('Request not found');

    await this.auditLogService.log({
      tenantId: orgId,
      userId: rejectedById,
      entityType: 'attendance_request',
      entityId: requestId,
      action: 'attendance_request_rejected',
      newValues: { reason },
    });

    return rows[0];
  }

  async getOrgBreakViolations(orgId: string, filters: any) {
    const { employee_id, date_from, date_to } = filters;
    let query = `
      SELECT bs.*, e.first_name, e.last_name, e.employee_code
      FROM break_sessions bs
      JOIN employees e ON bs.employee_id = e.id
      WHERE bs.tenant_id = $1 AND bs.is_overdue = true`;
    const params: any[] = [orgId];
    if (date_from) { query += ` AND bs.date >= $${params.length + 1}`; params.push(date_from); }
    if (date_to) { query += ` AND bs.date <= $${params.length + 1}`; params.push(date_to); }
    if (employee_id) { query += ` AND bs.employee_id = $${params.length + 1}`; params.push(employee_id); }
    query += ' ORDER BY bs.date DESC, bs.started_at DESC';

    const { rows } = await this.db.query(query, params);
    return rows;
  }

  private async applyApprovedAttendanceCorrection(client: any, request: any): Promise<boolean> {
    if (request.request_type !== 'correction') return false;
    if (!request.requested_clock_in && !request.requested_clock_out) return false;

    const { rows } = await client.query(
      `SELECT employee_code
       FROM employees
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [request.employee_id, request.tenant_id],
    );
    const employeeCode = rows[0]?.employee_code;
    if (!employeeCode) throw new NotFoundException('Employee not found');

    const events: PunchEventDto[] = [];
    const baseDate = request.date instanceof Date
      ? request.date.toISOString().split('T')[0]
      : String(request.date).split('T')[0];
    if (request.requested_clock_in) {
      events.push(this.buildCorrectionPunchEvent(request, employeeCode, baseDate, request.requested_clock_in, PunchDirection.IN));
    }
    if (request.requested_clock_out) {
      events.push(this.buildCorrectionPunchEvent(request, employeeCode, baseDate, request.requested_clock_out, PunchDirection.OUT));
    }

    if (events.length > 0) {
      await this.attendanceEngine.processPunchEvents(request.tenant_id, null, events);
    }
    return true;
  }

  private buildCorrectionPunchEvent(
    request: any,
    employeeCode: string,
    date: string,
    time: string,
    punchType: PunchDirection,
  ): PunchEventDto {
    return {
      tenantId: request.tenant_id,
      integrationId: null,
      employeeCode,
      timestamp: new Date(`${date}T${time}`),
      punchType,
      verifyMethod: VerifyMethod.OTHER,
      providerName: 'manual',
      attendanceSource: AttendanceSource.MANUAL_ATTENDANCE,
      punchState: punchType,
      rawPayload: {
        attendance_request_id: request.id,
        requested_time: time,
        reason: request.reason ?? null,
      },
    };
  }

  async getOrgDepartments(orgId: string) {
    const { rows } = await this.db.query(
      `SELECT d.id, d.name, d.code, d.created_at,
        COUNT(e.id) as employee_count
       FROM departments d
       LEFT JOIN employees e ON e.department_id = d.id AND e.deleted_at IS NULL
       WHERE d.tenant_id = $1
       GROUP BY d.id ORDER BY d.name ASC`,
      [orgId],
    );
    return rows.map(r => ({ ...r, employee_count: parseInt(r.employee_count) }));
  }
}
