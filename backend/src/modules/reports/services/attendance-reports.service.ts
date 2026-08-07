import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class AttendanceReportsService {
  constructor(private db: DatabaseService) {}

  private buildWhere(filter: ReportFilterDto, params: any[], idx: number, arAlias = 'ar', eAlias = 'e') {
    let where = '';
    const { date_from, date_to, branch_id, department_id, employee_id, shift_id, attendance_status, verification_method } = filter;
    if (date_from)          { where += ` AND ${arAlias}.date >= $${idx++}`; params.push(date_from); }
    if (date_to)            { where += ` AND ${arAlias}.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)          { where += ` AND ${arAlias}.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id)      { where += ` AND ${eAlias}.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)        { where += ` AND ${arAlias}.employee_id = $${idx++}`; params.push(employee_id); }
    if (shift_id)           { where += ` AND ${arAlias}.shift_id = $${idx++}`; params.push(shift_id); }
    if (attendance_status)  { where += ` AND ${arAlias}.status = $${idx++}`; params.push(attendance_status); }
    if (verification_method){ where += ` AND ${arAlias}.verify_method = $${idx++}`; params.push(verification_method); }
    return { where, nextIdx: idx };
  }

  async getDailySummary(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        b.name                                                         AS branch,
        d.name                                                         AS department,
        COUNT(*)                                                       AS total,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))                 AS present,
        COUNT(*) FILTER (WHERE ar.status = 'absent')                  AS absent,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)                    AS late,
        COUNT(*) FILTER (WHERE ar.status = 'half_day')                AS half_day,
        ROUND(AVG(ar.late_minutes) FILTER (WHERE ar.late_minutes > 0)::numeric, 1) AS avg_late_mins,
        SUM(ar.overtime_minutes)                                       AS total_overtime_mins,
        COUNT(*) OVER()                                                AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY ar.date, b.name, d.name
      ORDER BY ar.date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getLateArrivals(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        ar.clock_in,
        ar.late_minutes,
        ar.attendance_source               AS source,
        ar.verify_method,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1
        AND ar.late_minutes > 0 ${where}
      ORDER BY ar.date DESC, ar.late_minutes DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getOvertime(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        d.name                               AS department,
        b.name                               AS branch,
        ar.clock_in,
        ar.clock_out,
        ar.overtime_minutes,
        ROUND(ar.overtime_minutes / 60.0::numeric, 2) AS overtime_hours,
        COUNT(*) OVER()                       AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1
        AND ar.overtime_minutes > 0 ${where}
      ORDER BY ar.date DESC, ar.overtime_minutes DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getAbsenteeism(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        COUNT(*) FILTER (WHERE ar.status = 'absent')  AS absent_days,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) AS present_days,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)    AS late_days,
        COUNT(*)                                       AS total_days,
        ROUND(
          COUNT(*) FILTER (WHERE ar.status = 'absent') * 100.0 / NULLIF(COUNT(*), 0)::numeric, 1
        )                                              AS absenteeism_pct,
        COUNT(*) OVER()                                AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, d.name, b.name
      HAVING COUNT(*) FILTER (WHERE ar.status = 'absent') > 0
      ORDER BY absent_days DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getSourceAnalytics(tenantId: string, filter: ReportFilterDto) {
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    const { date_from, date_to, branch_id } = filter;
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(ar.attendance_source, 'unrecorded')  AS source,
        COUNT(*)                                       AS punch_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()::numeric, 1) AS pct
      FROM attendance_records ar
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY ar.attendance_source
      ORDER BY punch_count DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getCorrectionHistory(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, employee_id, branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)   { where += ` AND ac.requested_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)     { where += ` AND ac.requested_at::date <= $${idx++}`; params.push(date_to); }
    if (employee_id) { where += ` AND ac.employee_id = $${idx++}`; params.push(employee_id); }
    if (branch_id)   { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        ac.id,
        ac.requested_at::date               AS date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        ac.original_state,
        ac.requested_state,
        ac.reason,
        ac.status,
        ac.requested_at,
        ac.decided_at,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_corrections ac
      JOIN employees e        ON ac.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ac.tenant_id = $1 ${where}
      ORDER BY ac.requested_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getEmployeeWorkHours(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))   AS present_days,
        COUNT(*) FILTER (WHERE ar.status = 'absent')    AS absent_days,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)      AS late_days,
        ROUND(
          SUM(EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in)) / 3600.0)
            FILTER (WHERE ar.clock_in IS NOT NULL AND ar.clock_out IS NOT NULL)::numeric, 2
        )                                               AS total_hours,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2) AS overtime_hours,
        SUM(ar.late_minutes)                            AS total_late_mins,
        COUNT(*) OVER()                                 AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, d.name, b.name
      ORDER BY e.first_name, e.last_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getMonthlyMatrix(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND ar.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))  AS present_count,
        COUNT(*) FILTER (WHERE ar.status = 'absent')   AS absent_count,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)     AS late_count,
        COUNT(*) FILTER (WHERE ar.status = 'half_day') AS half_day_count,
        ROUND(SUM(ar.late_minutes)::numeric, 0)        AS total_late_mins,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2) AS total_ot_hours,
        jsonb_object_agg(
          ar.date::text,
          jsonb_build_object(
            's', ar.status,
            'in', ar.clock_in,
            'out', ar.clock_out,
            'late', ar.late_minutes,
            'ot', ar.overtime_minutes
          )
        )                                              AS days,
        COUNT(*) OVER()                                AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, b.name, d.name
      ORDER BY e.first_name, e.last_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getPunchLogs(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND ar.employee_id = $${idx++}`; params.push(employee_id); }

    // Expand each attendance record into individual punch rows:
    //   - clock_in  → direction = 'IN'
    //   - clock_out → direction = 'OUT'  (only when clock_out is not null)
    // is_duplicate is flagged when punch_count > 2 (i.e. more than one IN+OUT pair)
    const { rows } = await this.db.query(`
      WITH base AS (
        SELECT
          ar.date,
          e.employee_code,
          e.first_name || ' ' || e.last_name  AS employee_name,
          b.name                              AS branch,
          d.name                              AS department,
          ar.clock_in,
          ar.clock_out,
          ar.verify_method,
          ar.source_device_id                AS device_id,
          ar.attendance_source,
          ar.punch_count,
          ar.is_overnight
        FROM attendance_records ar
        JOIN employees e        ON ar.employee_id = e.id
        LEFT JOIN branches b    ON ar.branch_id = b.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE ar.tenant_id = $1 ${where}
      ),
      punches AS (
        -- IN punch row
        SELECT
          date, employee_code, employee_name, branch, department,
          clock_in                            AS punch_time,
          'IN'                                AS direction,
          verify_method,
          device_id,
          attendance_source,
          (punch_count > 2)                   AS is_duplicate
        FROM base
        WHERE clock_in IS NOT NULL
        UNION ALL
        -- OUT punch row (only when check-out recorded)
        SELECT
          date, employee_code, employee_name, branch, department,
          clock_out                           AS punch_time,
          'OUT'                               AS direction,
          verify_method,
          device_id,
          attendance_source,
          (punch_count > 2)                   AS is_duplicate
        FROM base
        WHERE clock_out IS NOT NULL
      )
      SELECT
        *,
        COUNT(*) OVER() AS full_count
      FROM punches
      ORDER BY date DESC, punch_time ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }


  async getMissedPunches(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND ar.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        ar.clock_in,
        ar.punch_count,
        ar.attendance_source,
        ar.status,
        ar.verify_method,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1
        AND ar.clock_in IS NOT NULL
        AND ar.clock_out IS NULL
        AND ar.date < CURRENT_DATE ${where}
      ORDER BY ar.date DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getShiftAttendance(tenantId: string, filter: ReportFilterDto) {
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
        sd.name                                                    AS shift_name,
        sd.start_time,
        sd.end_time,
        ar.date,
        b.name                                                     AS branch,
        COUNT(*)                                                   AS total,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))             AS present,
        COUNT(*) FILTER (WHERE ar.status = 'absent')              AS absent,
        COUNT(*) FILTER (WHERE ar.status = 'late' OR ar.late_minutes > 0)                AS late,
        ROUND(
          COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0 / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                          AS attendance_pct,
        SUM(ar.overtime_minutes)                                   AS total_ot_mins,
        COUNT(*) OVER()                                            AS full_count
      FROM attendance_records ar
      JOIN employees e         ON ar.employee_id = e.id
      LEFT JOIN shift_definitions sd ON ar.shift_id = sd.id
      LEFT JOIN branches b     ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.shift_id IS NOT NULL ${where}
      GROUP BY sd.name, sd.start_time, sd.end_time, ar.date, b.name
      ORDER BY ar.date DESC, sd.name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getOvernightAttendance(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)   { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)     { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)   { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (employee_id) { where += ` AND ar.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        sd.name                             AS shift_name,
        ar.clock_in,
        ar.clock_out,
        ar.status,
        ar.overtime_minutes,
        ROUND(ar.overtime_minutes / 60.0::numeric, 2) AS overtime_hours,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_records ar
      JOIN employees e             ON ar.employee_id = e.id
      LEFT JOIN branches b         ON ar.branch_id = b.id
      LEFT JOIN departments d      ON e.department_id = d.id
      LEFT JOIN shift_definitions sd ON ar.shift_id = sd.id
      WHERE ar.tenant_id = $1
        AND ar.is_overnight = TRUE ${where}
      ORDER BY ar.date DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getRegularizationReport(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, employee_id, attendance_status, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)          { where += ` AND ac.requested_at::date >= $${idx++}`; params.push(date_from); }
    if (date_to)            { where += ` AND ac.requested_at::date <= $${idx++}`; params.push(date_to); }
    if (employee_id)        { where += ` AND ac.employee_id = $${idx++}`; params.push(employee_id); }
    if (branch_id)          { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (attendance_status)  { where += ` AND ac.status = $${idx++}`; params.push(attendance_status); }

    const { rows } = await this.db.query(`
      SELECT
        ac.id,
        ac.requested_at::date               AS request_date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        b.name                              AS branch,
        d.name                              AS department,
        (ac.original_state->>'clock_in')    AS original_clock_in,
        (ac.original_state->>'clock_out')   AS original_clock_out,
        (ac.requested_state->>'clock_in')   AS requested_clock_in,
        (ac.requested_state->>'clock_out')  AS requested_clock_out,
        ac.reason,
        ac.status,
        ac.requested_at,
        ac.decided_at,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_corrections ac
      JOIN employees e        ON ac.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ac.tenant_id = $1 ${where}
      ORDER BY ac.requested_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  /**
   * Per-employee, per-break-type duration breakdown (completed break
   * sessions). Informational only — does not feed payroll/overtime.
   */
  async getBreakDurationsReport(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND bs.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND bs.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND bs.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        bs.break_code,
        bs.reason_label,
        COUNT(*)                                       AS session_count,
        SUM(bs.duration_minutes)                       AS total_minutes,
        ROUND(AVG(bs.duration_minutes)::numeric, 1)    AS avg_minutes,
        COUNT(*) FILTER (WHERE bs.is_overdue)          AS overdue_count,
        COALESCE(SUM(bs.overdue_minutes), 0)           AS total_overdue_minutes,
        COUNT(*) OVER()                                AS full_count
      FROM break_sessions bs
      JOIN employees e        ON bs.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE bs.tenant_id = $1 AND bs.status = 'completed' ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, d.name, b.name, bs.break_code, bs.reason_label
      ORDER BY e.first_name, e.last_name, bs.break_code
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  /**
   * Overdue break sessions grouped per employee — for the abuse-tracking /
   * repeat-offender view.
   */
  async getBreakViolationsReport(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, department_id, employee_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from)     { where += ` AND bs.date >= $${idx++}`; params.push(date_from); }
    if (date_to)       { where += ` AND bs.date <= $${idx++}`; params.push(date_to); }
    if (branch_id)     { where += ` AND e.branch_id = $${idx++}`; params.push(branch_id); }
    if (department_id) { where += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (employee_id)   { where += ` AND bs.employee_id = $${idx++}`; params.push(employee_id); }

    const { rows } = await this.db.query(`
      SELECT
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        COUNT(*)                            AS violation_count,
        SUM(bs.overdue_minutes)             AS total_overdue_minutes,
        ROUND(AVG(bs.overdue_minutes)::numeric, 1) AS avg_overdue_minutes,
        MAX(bs.date)                        AS last_violation_date,
        COUNT(*) OVER()                     AS full_count
      FROM break_sessions bs
      JOIN employees e        ON bs.employee_id = e.id
      LEFT JOIN branches b    ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE bs.tenant_id = $1 AND bs.is_overdue = true ${where}
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, d.name, b.name
      ORDER BY violation_count DESC, total_overdue_minutes DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  /**
   * Informational view of (clock_out - clock_in) minus unpaid break
   * minutes per attendance record. Clearly NOT the payroll figure —
   * `payroll_attendance_summary` / overtime calculations are unaffected.
   */
  async getBreakAdjustedHoursReport(tenantId: string, filter: ReportFilterDto) {
    const { page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const { where, nextIdx } = this.buildWhere(filter, params, 2);
    const idx = nextIdx;

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        e.employee_code,
        e.first_name || ' ' || e.last_name  AS employee_name,
        d.name                              AS department,
        b.name                              AS branch,
        ar.clock_in,
        ar.clock_out,
        ROUND((EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in)) / 60.0)::numeric, 0)         AS gross_minutes,
        COALESCE(ar.total_break_minutes, 0)        AS total_break_minutes,
        COALESCE(ar.unpaid_break_minutes, 0)       AS unpaid_break_minutes,
        COALESCE(ar.total_overdue_break_minutes,0) AS total_overdue_break_minutes,
        ROUND((EXTRACT(EPOCH FROM (ar.clock_out - ar.clock_in)) / 60.0 - COALESCE(ar.unpaid_break_minutes, 0))::numeric, 0) AS break_adjusted_minutes,
        COUNT(*) OVER()                     AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ar.tenant_id = $1
        AND ar.clock_in IS NOT NULL AND ar.clock_out IS NOT NULL ${where}
      ORDER BY ar.date DESC, e.first_name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getVerificationMethodReport(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        COALESCE(ar.verify_method, 'unrecorded')       AS verify_method,
        b.name                                          AS branch,
        COUNT(*)                                        AS record_count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()::numeric, 1) AS pct
      FROM attendance_records ar
      LEFT JOIN branches b ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY ar.verify_method, b.name
      ORDER BY record_count DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }
}
