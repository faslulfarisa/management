import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class FinanceReportsService {
  constructor(private db: DatabaseService) {}

  async getExpenseBreakdown(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, department_id, branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND ex.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND ex.date <= $${idx++}`; params.push(date_to); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        ex.category,
        TO_CHAR(DATE_TRUNC('month', ex.date), 'YYYY-MM') AS month,
        COUNT(*)                                          AS count,
        SUM(ex.amount)                                    AS total_amount,
        COUNT(*) FILTER (WHERE ex.status = 'approved')   AS approved_count,
        SUM(ex.amount) FILTER (WHERE ex.status = 'approved') AS approved_amount,
        COUNT(*) FILTER (WHERE ex.status = 'pending')    AS pending_count,
        COUNT(*) OVER()                                  AS full_count
      FROM expenses ex
      LEFT JOIN employees e ON ex.employee_id = e.id
      WHERE ex.tenant_id = $1 ${where}
      GROUP BY ex.category, DATE_TRUNC('month', ex.date)
      ORDER BY month DESC, total_amount DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getInvoiceAging(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND inv.issue_date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND inv.issue_date <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(`
      SELECT
        inv.invoice_number,
        inv.customer_name                                    AS client_name,
        inv.issue_date,
        inv.due_date,
        inv.total_amount,
        inv.amount_paid                                      AS paid_amount,
        inv.total_amount - COALESCE(inv.amount_paid, 0)     AS outstanding,
        CASE WHEN inv.due_date IS NOT NULL
          THEN CURRENT_DATE - inv.due_date
          ELSE NULL
        END                                                  AS days_overdue,
        CASE
          WHEN inv.due_date IS NULL OR inv.due_date >= CURRENT_DATE THEN 'current'
          WHEN CURRENT_DATE - inv.due_date <= 30              THEN '1-30 days'
          WHEN CURRENT_DATE - inv.due_date <= 60              THEN '31-60 days'
          WHEN CURRENT_DATE - inv.due_date <= 90              THEN '61-90 days'
          ELSE '90+ days'
        END                                                  AS aging_bucket,
        inv.status,
        COUNT(*) OVER()                                      AS full_count
      FROM invoices inv
      WHERE inv.tenant_id = $1
        AND inv.status NOT IN ('paid', 'cancelled') ${where}
      ORDER BY days_overdue DESC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getBudgetVsActual(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND b.period_start >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND b.period_end <= $${idx++}`; params.push(date_to); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                    AS budget_name,
        COALESCE(b.department, 'General')         AS category,
        b.period_start                            AS start_date,
        b.period_end                              AS end_date,
        b.allocated                               AS budgeted,
        COALESCE(
          (SELECT SUM(ex.amount)
           FROM expenses ex
           WHERE ex.tenant_id = b.tenant_id
             AND ex.date BETWEEN b.period_start AND b.period_end
             AND ex.status = 'approved'
             AND (b.category IS NULL OR ex.category = b.category)
          ), 0
        )                                         AS actual,
        b.notes,
        COUNT(*) OVER()                           AS full_count
      FROM budgets b
      WHERE b.tenant_id = $1 ${where}
      ORDER BY b.period_start DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    const data = rows.map(r => ({
      ...r,
      variance: parseFloat(r.budgeted) - parseFloat(r.actual),
      utilization_pct: r.budgeted > 0
        ? Math.round(parseFloat(r.actual) * 100 / parseFloat(r.budgeted) * 10) / 10
        : 0,
    }));

    return { data, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getReimbursementStatus(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, department_id, employee_id, branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND r.expense_date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND r.expense_date <= $${idx++}`; params.push(date_to); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND r.employee_id = $${idx++}`; params.push(employee_id); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        r.category,
        r.amount,
        r.description,
        r.status,
        r.expense_date,
        COUNT(*) OVER()                     AS full_count
      FROM reimbursements r
      JOIN employees e        ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE r.tenant_id = $1 ${where}
      ORDER BY r.expense_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getPayrollCostAnalysis(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, payroll_month, payroll_year, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND MAKE_DATE(pr.year, pr.month, 1) >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND MAKE_DATE(pr.year, pr.month, 1) <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (payroll_month) { where += ` AND pr.month = $${idx++}`; params.push(payroll_month); }
    if (payroll_year)  { where += ` AND pr.year = $${idx++}`; params.push(payroll_year); }

    const { rows } = await this.db.query(`
      SELECT
        pr.year || '-' || LPAD(pr.month::text, 2, '0')  AS payroll_month,
        b.name                                           AS branch,
        COUNT(DISTINCT ps.employee_id)                   AS headcount,
        SUM(ps.gross_salary)                             AS total_gross,
        SUM(ps.overtime)                                 AS total_ot_cost,
        SUM(ps.pf)                                       AS total_pf,
        SUM(ps.tds)                                      AS total_tds,
        SUM(ps.total_deductions)                         AS total_deductions,
        SUM(ps.net_salary)                               AS total_net,
        SUM(ps.gross_salary + COALESCE(ps.pf, 0))        AS total_ctc_estimate,
        COUNT(*) OVER()                                  AS full_count
      FROM payslips ps
      JOIN payroll_runs pr    ON ps.payroll_run_id = pr.id
      JOIN employees e        ON ps.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      WHERE pr.tenant_id = $1 ${where}
      GROUP BY pr.year, pr.month, b.name
      ORDER BY pr.year DESC, pr.month DESC, total_gross DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getBranchExpenseSummary(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ex.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ex.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                            AS branch,
        TO_CHAR(DATE_TRUNC('month', ex.date), 'YYYY-MM') AS month,
        COUNT(*)                                          AS expense_count,
        SUM(ex.amount)                                    AS total_amount,
        SUM(ex.amount) FILTER (WHERE ex.status = 'approved') AS approved_amount,
        SUM(ex.amount) FILTER (WHERE ex.status = 'pending')  AS pending_amount,
        COUNT(*) OVER()                                   AS full_count
      FROM expenses ex
      JOIN employees e     ON ex.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE ex.tenant_id = $1 ${where}
      GROUP BY b.name, DATE_TRUNC('month', ex.date)
      ORDER BY month DESC, total_amount DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }
}
