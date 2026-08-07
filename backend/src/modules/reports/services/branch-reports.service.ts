import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class BranchReportsService {
  constructor(private db: DatabaseService) {}

  async getAttendanceSummary(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    else if (branchIds?.length) { where += ` AND ar.branch_id = ANY($${idx++}::uuid[])`; params.push(branchIds); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                                         AS branch,
        b.branch_type,
        COUNT(DISTINCT ar.employee_id)                                 AS unique_employees,
        COUNT(*)                                                       AS total_records,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))                 AS present,
        COUNT(*) FILTER (WHERE ar.status = 'absent')                  AS absent,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)                    AS late,
        COUNT(*) FILTER (WHERE ar.status = 'half_day')                AS half_day,
        ROUND(
          COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0
            / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                              AS attendance_pct,
        ROUND(AVG(ar.late_minutes) FILTER (WHERE ar.late_minutes > 0)::numeric, 1) AS avg_late_mins,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2)            AS total_ot_hours
      FROM attendance_records ar
      JOIN branches b ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY b.name, b.branch_type
      ORDER BY attendance_pct DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getPayrollSummary(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const { date_from, date_to, branch_id, payroll_month, payroll_year } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND MAKE_DATE(pr.year, pr.month, 1) >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND MAKE_DATE(pr.year, pr.month, 1) <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    else if (branchIds?.length) { where += ` AND e.branch_id = ANY($${idx++}::uuid[])`; params.push(branchIds); }
    if (payroll_month) { where += ` AND pr.month = $${idx++}`; params.push(payroll_month); }
    if (payroll_year)  { where += ` AND pr.year = $${idx++}`; params.push(payroll_year); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                           AS branch,
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        COUNT(DISTINCT ps.employee_id)                   AS headcount,
        SUM(ps.gross_salary)                             AS total_gross,
        SUM(ps.net_salary)                               AS total_net,
        SUM(ps.overtime)                                 AS total_ot_cost,
        SUM(ps.total_deductions)                         AS total_deductions,
        ROUND(AVG(ps.gross_salary)::numeric, 0)          AS avg_salary
      FROM payslips ps
      JOIN payroll_runs pr    ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE pr.tenant_id = $1 ${where}
      GROUP BY b.name, pr.year, pr.month
      ORDER BY total_gross DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getWorkforceComparison(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (filter.branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(filter.branch_id); }
    else if (branchIds?.length) { where += ` AND e.branch_id = ANY($${idx++}::uuid[])`; params.push(branchIds); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                                         AS branch,
        b.branch_type,
        COUNT(*)                                                       AS total,
        COUNT(*) FILTER (WHERE e.gender = 'male')                     AS male,
        COUNT(*) FILTER (WHERE e.gender = 'female')                   AS female,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%full%')          AS full_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%part%')          AS part_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%contract%')      AS contract,
        COUNT(*) FILTER (WHERE e.date_of_joining >= NOW() - INTERVAL '90 days') AS new_hires_90d,
        ROUND(AVG(EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)))::numeric, 1) AS avg_tenure
      FROM employees e
      JOIN branches b            ON e.branch_id = b.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      WHERE e.tenant_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL ${where}
      GROUP BY b.name, b.branch_type
      ORDER BY total DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getOvertimeComparison(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    else if (branchIds?.length) { where += ` AND ar.branch_id = ANY($${idx++}::uuid[])`; params.push(branchIds); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                            AS branch,
        COUNT(DISTINCT ar.employee_id) FILTER (WHERE ar.overtime_minutes > 0) AS employees_with_ot,
        SUM(ar.overtime_minutes)                          AS total_ot_mins,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2) AS total_ot_hours,
        ROUND(AVG(ar.overtime_minutes) FILTER (WHERE ar.overtime_minutes > 0)::numeric, 0) AS avg_ot_mins,
        COUNT(DISTINCT ar.employee_id)                    AS total_employees
      FROM attendance_records ar
      JOIN branches b ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY b.name
      ORDER BY total_ot_hours DESC NULLS LAST
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getLeaveComparison(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const { date_from, date_to, branch_id, leave_type_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = ' AND lr.status = \'approved\'';
    if (date_from)     { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    else if (branchIds?.length) { where += ` AND e.branch_id = ANY($${idx++}::uuid[])`; params.push(branchIds); }
    if (leave_type_id) { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(b.name, 'Unassigned')                   AS branch,
        COUNT(DISTINCT lr.employee_id)                    AS employees_on_leave,
        COUNT(*)                                          AS leave_applications,
        SUM(lr.days)                                      AS total_days,
        ROUND(AVG(lr.days)::numeric, 1)                  AS avg_days_per_request
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE lr.tenant_id = $1 ${where}
      GROUP BY b.name
      ORDER BY total_days DESC NULLS LAST
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getOperationalKpis(tenantId: string, filter: ReportFilterDto, branchIds?: string[]) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let attWhere = '';
    let empWhere = '';
    let bWhere = '';
    if (date_from) { attWhere += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { attWhere += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) {
      attWhere += ` AND ar.branch_id = $${idx}`;
      empWhere += ` AND e.branch_id = $${idx}`;
      bWhere += ` AND b.id = $${idx}`;
      params.push(branch_id);
      idx++;
    } else if (branchIds?.length) {
      attWhere += ` AND ar.branch_id = ANY($${idx}::uuid[])`;
      empWhere += ` AND e.branch_id = ANY($${idx}::uuid[])`;
      bWhere += ` AND b.id = ANY($${idx}::uuid[])`;
      params.push(branchIds);
      idx++;
    }

    const { rows } = await this.db.query(`
      WITH att AS (
        SELECT
          ar.branch_id,
          COUNT(*)                                               AS total_records,
          COUNT(*) FILTER (WHERE ar.status IN ('present','late')) AS present,
          COUNT(*) FILTER (WHERE ar.status = 'absent')          AS absent,
          COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)            AS late,
          ROUND(
            COUNT(*) FILTER (WHERE ar.status IN ('present','late')) * 100.0
              / NULLIF(COUNT(*), 0)::numeric, 1
          )                                                      AS attendance_pct,
          ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2)    AS total_ot_hours
        FROM attendance_records ar
        WHERE ar.tenant_id = $1 ${attWhere}
        GROUP BY ar.branch_id
      ),
      emp AS (
        SELECT
          e.branch_id,
          COUNT(*)                                               AS headcount
        FROM employees e
        WHERE e.tenant_id = $1
          AND e.status = 'active'
          AND e.deleted_at IS NULL ${empWhere}
        GROUP BY e.branch_id
      )
      SELECT
        b.name                   AS branch,
        b.branch_type,
        COALESCE(emp.headcount, 0) AS headcount,
        COALESCE(att.total_records, 0) AS total_att_records,
        COALESCE(att.present, 0) AS present,
        COALESCE(att.absent, 0)  AS absent,
        COALESCE(att.late, 0)    AS late,
        COALESCE(att.attendance_pct, 0) AS attendance_pct,
        COALESCE(att.total_ot_hours, 0) AS total_ot_hours
      FROM branches b
      LEFT JOIN att ON att.branch_id = b.id
      LEFT JOIN emp ON emp.branch_id = b.id
      WHERE b.tenant_id = $1
        AND b.is_active = TRUE
        AND b.deleted_at IS NULL ${bWhere}
      ORDER BY b.name
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }
}
