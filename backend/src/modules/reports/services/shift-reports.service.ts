import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class ShiftReportsService {
  constructor(private db: DatabaseService) {}

  async getShiftAllocation(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, department_id, shift_id, employee_id, date_from, date_to, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND sa.start_date <= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND (sa.end_date IS NULL OR sa.end_date >= $${idx++})`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (shift_id)      { where += ` AND sa.shift_id = $${idx++}`; params.push(shift_id); }
    if (employee_id)   { where += ` AND sa.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        d.name                               AS department,
        sd.name                              AS shift_name,
        sd.start_time,
        sd.end_time,
        sd.is_overnight,
        sa.start_date,
        sa.end_date,
        sa.is_active,
        COUNT(*) OVER()                      AS full_count
      FROM shift_assignments sa
      JOIN employees e          ON sa.employee_id = e.id
      JOIN shift_definitions sd ON sa.shift_id = sd.id
      LEFT JOIN branches b      ON e.branch_id = b.id
      LEFT JOIN departments d   ON e.department_id = d.id
      WHERE sa.tenant_id = $1
        AND sa.is_active = TRUE ${where}
      ORDER BY b.name, sd.name, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getShiftCoverage(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, shift_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ss.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ss.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (shift_id)  { where += ` AND ss.shift_id = $${idx++}`; params.push(shift_id); }

    const { rows } = await this.db.query(`
      SELECT
        ss.date,
        sd.name                                                        AS shift_name,
        sd.start_time,
        sd.end_time,
        b.name                                                         AS branch,
        COUNT(*)                                                       AS scheduled_count,
        COUNT(ar.id) FILTER (WHERE ar.status IN ('present', 'late'))  AS present_count,
        COUNT(ar.id) FILTER (WHERE ar.status = 'absent')              AS absent_count,
        ROUND(
          COUNT(ar.id) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0
            / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                              AS coverage_pct,
        COUNT(*) OVER()                                                AS full_count
      FROM shift_schedules ss
      JOIN shift_definitions sd  ON ss.shift_id = sd.id
      JOIN employees e           ON ss.employee_id = e.id
      LEFT JOIN branches b       ON e.branch_id = b.id
      LEFT JOIN attendance_records ar
        ON ar.employee_id = ss.employee_id
        AND ar.date = ss.date
        AND ar.tenant_id = ss.tenant_id
      WHERE ss.tenant_id = $1 ${where}
      GROUP BY ss.date, sd.name, sd.start_time, sd.end_time, b.name
      ORDER BY ss.date DESC, sd.name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getShiftChanges(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)   { where += ` AND sa.created_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)     { where += ` AND sa.created_at::date <= $${idx++}`; params.push(date_to); }
    if (branch_id)   { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (employee_id) { where += ` AND sa.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        sa.created_at::date                  AS change_date,
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        d.name                               AS department,
        sd.name                              AS new_shift,
        sd.start_time,
        sd.end_time,
        sa.start_date                        AS effective_from,
        sa.end_date                          AS effective_to,
        sa.is_active,
        COUNT(*) OVER()                      AS full_count
      FROM shift_assignments sa
      JOIN employees e          ON sa.employee_id = e.id
      JOIN shift_definitions sd ON sa.shift_id = sd.id
      LEFT JOIN branches b      ON e.branch_id = b.id
      LEFT JOIN departments d   ON e.department_id = d.id
      WHERE sa.tenant_id = $1 ${where}
      ORDER BY sa.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getOvertimeShifts(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, shift_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (shift_id)  { where += ` AND ar.shift_id = $${idx++}`; params.push(shift_id); }

    const { rows } = await this.db.query(`
      SELECT
        sd.name                              AS shift_name,
        sd.start_time,
        sd.end_time,
        b.name                               AS branch,
        COUNT(*)                             AS employees_with_ot,
        SUM(ar.overtime_minutes)             AS total_ot_mins,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2) AS total_ot_hours,
        ROUND(AVG(ar.overtime_minutes)::numeric, 0) AS avg_ot_mins,
        COUNT(*) OVER()                      AS full_count
      FROM attendance_records ar
      JOIN employees e              ON ar.employee_id = e.id
      LEFT JOIN shift_definitions sd ON ar.shift_id = sd.id
      LEFT JOIN branches b          ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.overtime_minutes > 0 ${where}
      GROUP BY sd.name, sd.start_time, sd.end_time, b.name
      ORDER BY total_ot_mins DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getOvernightShiftSummary(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        sd.name                                             AS shift_name,
        b.name                                             AS branch,
        COUNT(*)                                           AS total_overnight,
        COUNT(*) FILTER (WHERE ar.status = 'present')     AS present,
        COUNT(*) FILTER (WHERE ar.status = 'late')        AS late,
        SUM(ar.overtime_minutes)                           AS total_ot_mins,
        ROUND(
          COUNT(*) FILTER (WHERE ar.status = 'present') * 100.0 / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                  AS attendance_pct,
        COUNT(*) OVER()                                    AS full_count
      FROM attendance_records ar
      JOIN employees e               ON ar.employee_id = e.id
      LEFT JOIN shift_definitions sd ON ar.shift_id = sd.id
      LEFT JOIN branches b           ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.is_overnight = TRUE ${where}
      GROUP BY ar.date, sd.name, b.name
      ORDER BY ar.date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }
}
