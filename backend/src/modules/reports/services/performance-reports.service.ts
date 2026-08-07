import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class PerformanceReportsService {
  constructor(private db: DatabaseService) {}

  async getAttendanceBehaviourReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50, cycle_id, branch_id, department_id, employee_id } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (cycle_id) { where += ` AND s.cycle_id = $${idx++}`; params.push(cycle_id); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id) { where += ` AND s.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code, e.first_name, e.last_name,
        b.name AS branch, d.name AS department,
        rc.name AS cycle_name, s.period_start, s.period_end,
        s.business_working_days, s.present_days, s.half_day_count, s.late_count,
        s.unapproved_absence_days, s.paid_leave_days, s.unpaid_leave_days,
        s.approved_ot_hours, s.corrections_count,
        s.attendance_percentage, s.attendance_compliance_percentage,
        s.behaviour_score, s.behaviour_rating, s.status,
        COUNT(*) OVER() AS full_count
      FROM attendance_performance_snapshots s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN review_cycles rc ON s.cycle_id = rc.id
      WHERE s.tenant_id = $1 ${where}
      ORDER BY rc.start_date DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getDepartmentPerformanceReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50, cycle_id, branch_id } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (cycle_id) { where += ` AND s.cycle_id = $${idx++}`; params.push(cycle_id); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        d.id AS department_id, d.name AS department,
        COUNT(*)::int AS employee_count,
        ROUND(AVG(s.behaviour_score)::numeric, 2) AS avg_behaviour_score,
        ROUND(AVG(s.attendance_percentage)::numeric, 2) AS avg_attendance_pct,
        ROUND(AVG(s.attendance_compliance_percentage)::numeric, 2) AS avg_compliance_pct,
        SUM(s.late_count)::int AS total_late_count,
        SUM(s.unapproved_absence_days)::int AS total_unapproved_absence,
        COUNT(*) OVER() AS full_count
      FROM attendance_performance_snapshots s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE s.tenant_id = $1 ${where}
      GROUP BY d.id, d.name
      ORDER BY avg_behaviour_score DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getBranchPerformanceReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50, cycle_id, branch_id } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (cycle_id) { where += ` AND s.cycle_id = $${idx++}`; params.push(cycle_id); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        b.id AS branch_id, b.name AS branch,
        COUNT(*)::int AS employee_count,
        ROUND(AVG(s.behaviour_score)::numeric, 2) AS avg_behaviour_score,
        ROUND(AVG(s.attendance_percentage)::numeric, 2) AS avg_attendance_pct,
        ROUND(AVG(s.attendance_compliance_percentage)::numeric, 2) AS avg_compliance_pct,
        SUM(s.late_count)::int AS total_late_count,
        SUM(s.unapproved_absence_days)::int AS total_unapproved_absence,
        COUNT(*) OVER() AS full_count
      FROM attendance_performance_snapshots s
      JOIN employees e ON s.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE s.tenant_id = $1 ${where}
      GROUP BY b.id, b.name
      ORDER BY avg_behaviour_score DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getEmployeePerformanceReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50, cycle_id, employee_id, branch_id, department_id } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (cycle_id) { where += ` AND r.cycle_id = $${idx++}`; params.push(cycle_id); }
    if (employee_id) { where += ` AND r.employee_id = $${idx++}`; params.push(employee_id); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code, e.first_name, e.last_name,
        b.name AS branch, d.name AS department,
        rc.name AS cycle_name,
        r.kra_score, r.kpi_score, r.attendance_score,
        r.attendance_score_overridden, r.overall_score, r.rating, r.status,
        r.locked_at,
        COUNT(*) OVER() AS full_count
      FROM performance_reviews r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN review_cycles rc ON r.cycle_id = rc.id
      WHERE r.tenant_id = $1 ${where}
      ORDER BY rc.start_date DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getReviewCycleReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50, cycle_id } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let where = '';
    let idx = 2;
    if (cycle_id) { where += ` AND rc.id = $${idx++}`; params.push(cycle_id); }

    const { rows } = await this.db.query(`
      SELECT
        rc.id, rc.name, rc.type, rc.start_date, rc.end_date, rc.status,
        rc.attendance_last_calculated_at,
        COUNT(DISTINCT r.id)::int AS review_count,
        COUNT(DISTINCT s.id)::int AS snapshot_count,
        ROUND(AVG(r.overall_score)::numeric, 2) AS avg_overall_score,
        ROUND(AVG(s.behaviour_score)::numeric, 2) AS avg_attendance_score,
        COUNT(*) OVER() AS full_count
      FROM review_cycles rc
      LEFT JOIN performance_reviews r ON r.cycle_id = rc.id AND r.tenant_id = rc.tenant_id
      LEFT JOIN attendance_performance_snapshots s ON s.cycle_id = rc.id AND s.tenant_id = rc.tenant_id
      WHERE rc.tenant_id = $1 ${where}
      GROUP BY rc.id, rc.name, rc.type, rc.start_date, rc.end_date, rc.status, rc.attendance_last_calculated_at
      ORDER BY rc.start_date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }
}
