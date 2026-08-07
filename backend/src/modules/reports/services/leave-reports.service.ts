import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class LeaveReportsService {
  constructor(private db: DatabaseService) {}

  async getLeaveBalance(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, employee_id, leave_type_id, payroll_year, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND lb.employee_id = $${idx++}`; params.push(employee_id); }
    if (leave_type_id) { where += ` AND lb.leave_type_id = $${idx++}`; params.push(leave_type_id); }
    if (payroll_year)  { where += ` AND lb.year = $${idx++}`; params.push(payroll_year); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        lt.name                             AS leave_type,
        lb.year,
        lb.allocated                        AS entitled_days,
        lb.used                             AS days_taken,
        COALESCE((
          SELECT SUM(lr.days)
          FROM leave_requests lr
          WHERE lr.tenant_id = lb.tenant_id
            AND lr.employee_id = lb.employee_id
            AND lr.leave_type_id = lb.leave_type_id
            AND lr.status = 'pending'
        ), 0)                               AS pending_days,
        lb.available                        AS balance_days,
        ROUND(lb.used * 100.0 / NULLIF(lb.allocated, 0)::numeric, 1) AS utilization_pct,
        COUNT(*) OVER()                     AS full_count
      FROM leave_balances lb
      JOIN employees e        ON lb.employee_id = e.id
      JOIN leave_types lt     ON lb.leave_type_id = lt.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lb.tenant_id = $1 ${where}
      ORDER BY e.first_name, e.last_name, lt.name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getLeaveUtilizationByType(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, leave_type_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (leave_type_id) { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        lt.name                                                         AS leave_type,
        lt.paid,
        COUNT(*)                                                        AS applications,
        COUNT(*) FILTER (WHERE lr.status = 'approved')                 AS approved,
        COUNT(*) FILTER (WHERE lr.status = 'rejected')                 AS rejected,
        COUNT(*) FILTER (WHERE lr.status = 'pending')                  AS pending,
        SUM(lr.days) FILTER (WHERE lr.status = 'approved')             AS total_days_approved,
        ROUND(AVG(lr.days) FILTER (WHERE lr.status = 'approved')::numeric, 1) AS avg_days_per_request
      FROM leave_requests lr
      JOIN leave_types lt     ON lr.leave_type_id = lt.id
      JOIN employees e        ON lr.employee_id = e.id
      WHERE lr.tenant_id = $1 ${where}
      GROUP BY lt.name, lt.paid
      ORDER BY total_days_approved DESC NULLS LAST
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getLeaveApprovalStatus(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, leave_type_id, attendance_status, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)          { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)            { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)          { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)      { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)        { where += ` AND lr.employee_id = $${idx++}`; params.push(employee_id); }
    if (leave_type_id)      { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }
    if (attendance_status)  { where += ` AND lr.status = $${idx++}`; params.push(attendance_status); }

    const { rows } = await this.db.query(`
      SELECT
        lr.id,
        lr.created_at                        AS created_at,
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        d.name                               AS department,
        lt.name                              AS leave_type,
        lr.start_date                        AS from_date,
        lr.end_date                          AS to_date,
        lr.days                              AS total_days,
        lr.reason,
        lr.status,
        lr.approved_at,
        lr.rejection_reason,
        COALESCE(re.first_name || ' ' || re.last_name, ru.email, '—') AS reviewed_by,
        COUNT(*) OVER()                      AS full_count
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      JOIN leave_types lt     ON lr.leave_type_id = lt.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users ru      ON lr.approved_by = ru.id
      LEFT JOIN employees re  ON ru.employee_id = re.id
      WHERE lr.tenant_id = $1 ${where}
      ORDER BY lr.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getLeaveCalendar(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, leave_type_id, page = 1, limit = 100 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = ' AND lr.status = \'approved\'';
    if (date_from)     { where += ` AND lr.end_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND lr.start_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (leave_type_id) { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        d.name                               AS department,
        lt.name                              AS leave_type,
        lr.start_date                        AS from_date,
        lr.end_date                          AS to_date,
        lr.days                              AS total_days,
        lr.status,
        COUNT(*) OVER()                      AS full_count
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      JOIN leave_types lt     ON lr.leave_type_id = lt.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lr.tenant_id = $1 ${where}
      ORDER BY lr.start_date, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getDepartmentLeaveAnalytics(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, leave_type_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (leave_type_id) { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(d.name, 'Unassigned')                  AS department,
        b.name                                          AS branch,
        lt.name                                         AS leave_type,
        COUNT(*)                                        AS applications,
        SUM(lr.days) FILTER (WHERE lr.status = 'approved') AS days_approved,
        COUNT(*) FILTER (WHERE lr.status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE lr.status = 'rejected')  AS rejected,
        ROUND(AVG(lr.days)::numeric, 1)                 AS avg_days
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      JOIN leave_types lt     ON lr.leave_type_id = lt.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lr.tenant_id = $1 ${where}
      GROUP BY d.name, b.name, lt.name
      ORDER BY days_approved DESC NULLS LAST
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getBranchLeaveAnalytics(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, leave_type_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (leave_type_id) { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(b.name, 'Unassigned')                  AS branch,
        COUNT(DISTINCT lr.employee_id)                   AS employees_on_leave,
        COUNT(*)                                         AS applications,
        SUM(lr.days) FILTER (WHERE lr.status = 'approved') AS days_approved,
        COUNT(*) FILTER (WHERE lr.status = 'pending')    AS pending,
        ROUND(AVG(lr.days) FILTER (WHERE lr.status = 'approved')::numeric, 1) AS avg_days
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE lr.tenant_id = $1 ${where}
      GROUP BY b.name
      ORDER BY days_approved DESC NULLS LAST
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }
}
