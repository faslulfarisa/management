import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class HrReportsService {
  constructor(private db: DatabaseService) {}

  async getHeadcountByDepartment(tenantId: string, filter: ReportFilterDto) {
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (filter.branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(filter.branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(d.name, 'Unassigned')       AS department,
        b.name                               AS branch,
        COUNT(*)                             AS headcount,
        COUNT(*) FILTER (WHERE e.gender = 'male')   AS male,
        COUNT(*) FILTER (WHERE e.gender = 'female') AS female,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%full%')     AS full_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%part%')     AS part_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%contract%') AS contract
      FROM employees e
      LEFT JOIN departments d       ON e.department_id = d.id
      LEFT JOIN branches b          ON e.branch_id = b.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      WHERE e.tenant_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL ${where}
      GROUP BY d.name, b.name
      ORDER BY headcount DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getJoiningTrend(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND e.date_of_joining >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND e.date_of_joining <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.date_of_joining), 'YYYY-MM') AS month,
        b.name                                                       AS branch,
        COUNT(*)                                                     AS joinings,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%full%')        AS full_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%contract%')    AS contract
      FROM employees e
      LEFT JOIN branches b          ON e.branch_id = b.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      WHERE e.tenant_id = $1
        AND e.deleted_at IS NULL
        AND e.date_of_joining IS NOT NULL ${where}
      GROUP BY DATE_TRUNC('month', e.date_of_joining), b.name
      ORDER BY month DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getResignationTrend(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND e.updated_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND e.updated_at::date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.updated_at), 'YYYY-MM') AS month,
        b.name                                                  AS branch,
        COALESCE(d.name, 'Unassigned')                         AS department,
        COUNT(*)                                                AS resignations
      FROM employees e
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.tenant_id = $1
        AND e.status = 'resigned'
        AND e.deleted_at IS NULL ${where}
      GROUP BY DATE_TRUNC('month', e.updated_at), b.name, d.name
      ORDER BY month DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getLeaveUtilization(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, leave_type_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)      { where += ` AND lr.start_date >= $${idx++}`; params.push(date_from); }
    if (date_to)        { where += ` AND lr.end_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)      { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)  { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)    { where += ` AND lr.employee_id = $${idx++}`; params.push(employee_id); }
    if (leave_type_id)  { where += ` AND lr.leave_type_id = $${idx++}`; params.push(leave_type_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        lt.name                             AS leave_type,
        COUNT(*)                            AS applications,
        SUM(lr.days)                        AS total_days_taken,
        COUNT(*) FILTER (WHERE lr.status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE lr.status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE lr.status = 'pending')  AS pending,
        COUNT(*) OVER()                                AS full_count
      FROM leave_requests lr
      JOIN employees e        ON lr.employee_id = e.id
      JOIN leave_types lt     ON lr.leave_type_id = lt.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE lr.tenant_id = $1 ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, b.name, d.name, lt.name
      ORDER BY total_days_taken DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getWorkforceStatistics(tenantId: string, filter: ReportFilterDto) {
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (filter.branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(filter.branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        COUNT(*)                                                       AS total_active,
        COUNT(*) FILTER (WHERE e.gender = 'male')                     AS male,
        COUNT(*) FILTER (WHERE e.gender = 'female')                   AS female,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%full%')          AS full_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%part%')          AS part_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%contract%')      AS contract,
        ROUND(AVG(
          EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining))
        )::numeric, 1)                                                AS avg_tenure_years,
        COUNT(*) FILTER (WHERE e.date_of_joining >= NOW() - INTERVAL '90 days') AS new_hires_90d,
        COUNT(DISTINCT e.branch_id)                                   AS branch_count,
        COUNT(DISTINCT e.department_id)                               AS department_count
      FROM employees e
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      WHERE e.tenant_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL ${where}
    `, params);

    return { data: rows, total: 1, page: 1, limit: 1 };
  }

  async getEmployeeDirectory(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, employee_id, attendance_status, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (branch_id)      { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)  { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)    { where += ` AND e.id = $${idx++}`; params.push(employee_id); }
    if (attendance_status === 'inactive') {
      where += ` AND e.status != 'active'`;
    } else {
      where += ` AND e.status = 'active'`;
    }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        e.email,
        e.phone,
        e.gender,
        e.date_of_joining,
        e.status,
        b.name                               AS branch,
        d.name                               AS department,
        et.name                              AS employment_type,
        pos.title                            AS position,
        ROUND(
          EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining))::numeric, 1
        )                                    AS tenure_years,
        COUNT(*) OVER()                      AS full_count
      FROM employees e
      LEFT JOIN branches b          ON e.branch_id = b.id
      LEFT JOIN departments d       ON e.department_id = d.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      LEFT JOIN positions pos       ON e.position_id = pos.id
      WHERE e.tenant_id = $1
        AND e.deleted_at IS NULL ${where}
      ORDER BY e.first_name, e.last_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getTransferHistory(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)   { where += ` AND t.effective_date >= $${idx++}`; params.push(date_from); }
    if (date_to)     { where += ` AND t.effective_date <= $${idx++}`; params.push(date_to); }
    if (branch_id)   { where += ` AND (t.from_branch_id = $${idx} OR t.to_branch_id = $${idx})`; params.push(branch_id); idx++; }
    if (employee_id) { where += ` AND t.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        t.effective_date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        fb.name                             AS from_branch,
        tb.name                             AS to_branch,
        fd.name                             AS from_department,
        td.name                             AS to_department,
        t.transfer_type,
        t.status,
        t.remarks,
        COUNT(*) OVER()                     AS full_count
      FROM employee_branch_transfers t
      JOIN employees e         ON t.employee_id = e.id
      LEFT JOIN branches fb    ON t.from_branch_id = fb.id
      LEFT JOIN branches tb    ON t.to_branch_id = tb.id
      LEFT JOIN departments fd ON t.from_department_id = fd.id
      LEFT JOIN departments td ON t.to_department_id = td.id
      WHERE t.tenant_id = $1 ${where}
      ORDER BY t.effective_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getFineDeductions(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, attendance_status, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)          { where += ` AND ef.created_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)            { where += ` AND ef.created_at::date <= $${idx++}`; params.push(date_to); }
    if (branch_id)          { where += ` AND ef.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)      { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)        { where += ` AND ef.employee_id = $${idx++}`; params.push(employee_id); }
    if (attendance_status)  { where += ` AND ef.status = $${idx++}`; params.push(attendance_status); }

    const { rows } = await this.db.query(`
      SELECT
        ef.created_at::date                 AS fine_date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        dc.name                             AS category,
        ef.title,
        ef.fine_amount,
        ef.deduction_mode,
        ef.status,
        ef.amount_deducted,
        ef.amount_paid_manually,
        ef.amount_waived,
        ef.payroll_month,
        ef.payroll_year,
        COUNT(*) OVER()                     AS full_count
      FROM employee_fines ef
      JOIN employees e               ON ef.employee_id = e.id
      LEFT JOIN branches b           ON ef.branch_id = b.id
      LEFT JOIN departments d        ON e.department_id = d.id
      LEFT JOIN deduction_categories dc ON ef.category_id = dc.id
      WHERE ef.tenant_id = $1 ${where}
      ORDER BY ef.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getTenureAnalysis(tenantId: string, filter: ReportFilterDto) {
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (filter.branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(filter.branch_id); }
    if (filter.department_id) { where += ` AND e.department_id = $${idx++}`; params.push(filter.department_id); }

    const { rows } = await this.db.query(`
      SELECT
        b.name AS branch,
        d.name AS department,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)) < 1)   AS lt_1_year,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)) BETWEEN 1 AND 2) AS yr_1_2,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)) BETWEEN 3 AND 4) AS yr_3_4,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)) BETWEEN 5 AND 9) AS yr_5_9,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)) >= 10)  AS yr_10_plus,
        COUNT(*)                                                                         AS total,
        ROUND(AVG(EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)))::numeric, 1)        AS avg_tenure
      FROM employees e
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.tenant_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL
        AND e.date_of_joining IS NOT NULL ${where}
      GROUP BY b.name, d.name
      ORDER BY total DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getAccountStatusReport(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, status, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (status)     { where += ` AND u.status = $${idx++}`; params.push(status); }
    if (branch_id)  { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (date_from)  { where += ` AND u.deactivated_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)    { where += ` AND u.deactivated_at::date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(`
      SELECT
        u.id,
        e.employee_code,
        COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '') AS employee_name,
        u.email,
        b.name                               AS branch,
        u.status,
        dr.label                             AS deactivation_reason,
        dr.category                          AS deactivation_reason_category,
        u.deactivation_notes,
        du.email                             AS deactivated_by,
        u.deactivated_at,
        ru.email                             AS reactivated_by,
        u.reactivated_at,
        COUNT(*) OVER()                      AS full_count
      FROM users u
      LEFT JOIN employees e          ON e.id = u.employee_id AND e.deleted_at IS NULL
      LEFT JOIN branches b           ON b.id = e.branch_id
      LEFT JOIN deactivation_reasons dr ON dr.id = u.deactivation_reason_id
      LEFT JOIN users du             ON du.id = u.deactivated_by
      LEFT JOIN users ru             ON ru.id = u.reactivated_by
      WHERE u.tenant_id = $1
        AND u.deleted_at IS NULL
        AND u.status != 'active' ${where}
      ORDER BY u.deactivated_at DESC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getDepartmentDemographics(tenantId: string, filter: ReportFilterDto) {
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (filter.branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(filter.branch_id); }
    if (filter.department_id) { where += ` AND e.department_id = $${idx++}`; params.push(filter.department_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(d.name, 'Unassigned') AS department,
        b.name                         AS branch,
        COUNT(*)                       AS total,
        COUNT(*) FILTER (WHERE e.gender = 'male')   AS male,
        COUNT(*) FILTER (WHERE e.gender = 'female') AS female,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%full%')     AS full_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%part%')     AS part_time,
        COUNT(*) FILTER (WHERE LOWER(et.name) LIKE '%contract%') AS contract,
        ROUND(AVG(EXTRACT(YEAR FROM AGE(NOW(), e.date_of_joining)))::numeric, 1) AS avg_tenure
      FROM employees e
      LEFT JOIN branches b          ON e.branch_id = b.id
      LEFT JOIN departments d       ON e.department_id = d.id
      LEFT JOIN employment_types et ON e.employment_type_id = et.id
      WHERE e.tenant_id = $1
        AND e.status = 'active'
        AND e.deleted_at IS NULL ${where}
      GROUP BY d.name, b.name
      ORDER BY total DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }
}
