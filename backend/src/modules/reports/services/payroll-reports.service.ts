import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class PayrollReportsService {
  constructor(private db: DatabaseService) {}

  private payrollDateWhere(filter: ReportFilterDto, params: any[], idx: number) {
    let where = '';
    const { date_from, date_to, payroll_month, payroll_year } = filter;
    if (date_from)      { where += ` AND MAKE_DATE(pr.year, pr.month, 1) >= $${idx++}`; params.push(date_from); }
    if (date_to)        { where += ` AND MAKE_DATE(pr.year, pr.month, 1) <= $${idx++}`; params.push(date_to); }
    if (payroll_month)  { where += ` AND pr.month = $${idx++}`; params.push(payroll_month); }
    if (payroll_year)   { where += ` AND pr.year = $${idx++}`; params.push(payroll_year); }
    return { where, nextIdx: idx };
  }

  async getMonthlySummary(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        b.name                                           AS branch,
        d.name                                           AS department,
        COUNT(DISTINCT ps.employee_id)                   AS headcount,
        SUM(ps.gross_salary)                             AS total_gross,
        SUM(ps.net_salary)                               AS total_net,
        SUM(ps.total_deductions)                         AS total_deductions,
        SUM(ps.overtime)                                 AS total_overtime_cost,
        ROUND(AVG(ps.gross_salary)::numeric, 2)          AS avg_gross,
        pr.status                                        AS run_status,
        COUNT(*) OVER()                                  AS full_count
      FROM payroll_runs pr
      JOIN payslips ps        ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.tenant_id = $1 ${where}
      GROUP BY pr.year, pr.month, b.name, d.name, pr.status
      ORDER BY pr.year DESC, pr.month DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getPayslipDetail(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND ps.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        e.employee_code,
        e.first_name || ' ' || e.last_name              AS employee_name,
        d.name                                           AS department,
        b.name                                           AS branch,
        ps.gross_salary,
        ps.net_salary,
        ps.total_deductions,
        ps.overtime                                      AS overtime_amount,
        ps.basic,
        ps.hra,
        ps.pf,
        ps.tds,
        ps.status,
        COUNT(*) OVER()                                  AS full_count
      FROM payslips ps
      JOIN payroll_runs pr     ON ps.payroll_run_id = pr.id
      JOIN employees e         ON ps.employee_id = e.id
      LEFT JOIN branches b     ON e.branch_id = b.id
      LEFT JOIN departments d  ON e.department_id = d.id
      WHERE pr.tenant_id = $1 ${where}
      ORDER BY pr.year DESC, pr.month DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getOvertimeCost(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')   AS payroll_month,
        d.name                                            AS department,
        b.name                                            AS branch,
        COUNT(*) FILTER (WHERE ps.overtime > 0)           AS employees_with_ot,
        SUM(ps.overtime)                                  AS total_ot_cost,
        ROUND(AVG(ps.overtime) FILTER (WHERE ps.overtime > 0)::numeric, 2) AS avg_ot_cost,
        COUNT(*) OVER()                                   AS full_count
      FROM payslips ps
      JOIN payroll_runs pr     ON ps.payroll_run_id = pr.id
      JOIN employees e         ON ps.employee_id = e.id
      LEFT JOIN branches b     ON e.branch_id = b.id
      LEFT JOIN departments d  ON e.department_id = d.id
      WHERE pr.tenant_id = $1 ${where}
      GROUP BY pr.year, pr.month, d.name, b.name
      ORDER BY pr.year DESC, pr.month DESC, total_ot_cost DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getDeductionAnalysis(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        b.name                                           AS branch,
        COUNT(DISTINCT ps.employee_id)                   AS headcount,
        SUM(ps.total_deductions)                         AS total_deductions,
        SUM(ps.gross_salary)                             AS total_gross,
        ROUND(
          SUM(ps.total_deductions) * 100.0 / NULLIF(SUM(ps.gross_salary), 0)::numeric, 2
        )                                                AS deduction_pct,
        COUNT(*) OVER()                                  AS full_count
      FROM payslips ps
      JOIN payroll_runs pr    ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE pr.tenant_id = $1 ${where}
      GROUP BY pr.year, pr.month, b.name
      ORDER BY pr.year DESC, pr.month DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getSalarySheet(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, page = 1, limit = 500 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        e.employee_code,
        e.first_name || ' ' || e.last_name              AS employee_name,
        d.name                                           AS department,
        b.name                                           AS branch,
        ps.basic,
        ps.hra,
        ps.overtime                                      AS ot_pay,
        ps.gross_salary,
        ps.pf,
        ps.tds,
        ps.total_deductions,
        ps.net_salary,
        ps.status                                        AS payslip_status,
        COUNT(*) OVER()                                  AS full_count
      FROM payslips ps
      JOIN payroll_runs pr    ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pr.tenant_id = $1 ${where}
      ORDER BY b.name, d.name, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getPayrollAudit(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where: dateWhere, nextIdx } = this.payrollDateWhere(filter, params, 2);
    let idx = nextIdx;
    let where = dateWhere;
    if (branch_id)   { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (employee_id) { where += ` AND ps.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name              AS employee_name,
        b.name                                           AS branch,
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        ps.gross_salary,
        ps.net_salary,
        ps.total_deductions,
        ps.overtime,
        LAG(ps.net_salary) OVER (PARTITION BY ps.employee_id ORDER BY pr.year, pr.month) AS prev_net_salary,
        ps.net_salary -
          LAG(ps.net_salary) OVER (PARTITION BY ps.employee_id ORDER BY pr.year, pr.month)
          AS net_variance,
        ps.status,
        COUNT(*) OVER()                                  AS full_count
      FROM payslips ps
      JOIN payroll_runs pr    ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE pr.tenant_id = $1 ${where}
      ORDER BY pr.year DESC, pr.month DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getFineDeductionReport(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, employee_id, payroll_month, payroll_year, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (branch_id)      { where += ` AND ef.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)  { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)    { where += ` AND ef.employee_id = $${idx++}`; params.push(employee_id); }
    if (payroll_month)  { where += ` AND ef.payroll_month = $${idx++}`; params.push(payroll_month); }
    if (payroll_year)   { where += ` AND ef.payroll_year = $${idx++}`; params.push(payroll_year); }

    const { rows } = await this.db.query(`
      SELECT
        ef.payroll_year || '-' || LPAD(ef.payroll_month::text, 2, '0') AS payroll_month,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        dc.name                             AS fine_category,
        ef.title                            AS fine_title,
        ef.fine_amount,
        ef.amount_deducted,
        ef.status,
        COUNT(*) OVER()                     AS full_count
      FROM employee_fines ef
      JOIN employees e               ON ef.employee_id = e.id
      LEFT JOIN branches b           ON ef.branch_id = b.id
      LEFT JOIN departments d        ON e.department_id = d.id
      LEFT JOIN deduction_categories dc ON ef.category_id = dc.id
      WHERE ef.tenant_id = $1
        AND ef.deduction_mode = 'payroll'
        AND ef.status IN ('approved', 'payroll_deducted') ${where}
      ORDER BY ef.payroll_year DESC, ef.payroll_month DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }
}
