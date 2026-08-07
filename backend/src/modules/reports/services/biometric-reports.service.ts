import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ReportFilterDto } from '../dto/report-filter.dto';

@Injectable()
export class BiometricReportsService {
  constructor(private db: DatabaseService) {}

  async getDeviceActivity(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, device_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }
    if (device_id) { where += ` AND ar.biometric_device_id = $${idx++}`; params.push(device_id); }

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        bd.name                              AS device_name,
        bd.serial_number,
        bd.hardware_type,
        b.name                               AS branch,
        COUNT(*)                             AS attendance_records,
        SUM(ar.punch_count)                  AS total_punches,
        COUNT(*) FILTER (WHERE ar.verify_method = 'fingerprint') AS fingerprint_count,
        COUNT(*) FILTER (WHERE ar.verify_method = 'face')        AS face_count,
        COUNT(*) FILTER (WHERE ar.verify_method = 'card')        AS card_count,
        COUNT(*) OVER()                      AS full_count
      FROM attendance_records ar
      LEFT JOIN biometric_devices bd ON ar.biometric_device_id = bd.id
      LEFT JOIN branches b           ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.biometric_device_id IS NOT NULL ${where}
      GROUP BY ar.date, bd.name, bd.serial_number, bd.hardware_type, b.name
      ORDER BY ar.date DESC, total_punches DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getVerificationBreakdown(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id } = filter;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (date_from) { where += ` AND ar.date >= $${idx++}`; params.push(date_from); }
    if (date_to)   { where += ` AND ar.date <= $${idx++}`; params.push(date_to); }
    if (branch_id) { where += ` AND ar.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        b.name                                               AS branch,
        COALESCE(ar.verify_method, 'unrecorded')             AS verify_method,
        COUNT(*)                                             AS count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY b.name)::numeric, 1) AS pct_within_branch
      FROM attendance_records ar
      LEFT JOIN branches b ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1 ${where}
      GROUP BY b.name, ar.verify_method
      ORDER BY b.name, count DESC
    `, params);

    return { data: rows, total: rows.length, page: 1, limit: rows.length };
  }

  async getDeviceRegistry(tenantId: string, filter: ReportFilterDto) {
    const { branch_id, page = 1, limit = 50 } = filter;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    let idx = 2;
    let where = '';
    if (branch_id) { where += ` AND bd.branch_id = $${idx++}`; params.push(branch_id); }

    const { rows } = await this.db.query(`
      SELECT
        bd.id,
        bd.name                              AS device_name,
        bd.serial_number,
        bd.provider_name,
        bd.hardware_type,
        bd.capabilities,
        bd.platform,
        bd.is_online,
        bd.is_active,
        b.name                               AS branch,
        bd.metadata,
        COUNT(*) OVER()                      AS full_count
      FROM biometric_devices bd
      LEFT JOIN branches b ON bd.branch_id = b.id
      WHERE bd.tenant_id = $1 ${where}
      ORDER BY b.name, bd.name
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getPunchTimeline(tenantId: string, filter: ReportFilterDto) {
    const { date_from, date_to, branch_id, employee_id, page = 1, limit = 100 } = filter;
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
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        ar.clock_in,
        ar.clock_out,
        ar.punch_count,
        ar.punch_sequence,
        ar.verify_method,
        ar.attendance_source                 AS source,
        ar.source_device_id,
        ar.provider_name,
        ar.status,
        COUNT(*) OVER()                      AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.clock_in IS NOT NULL ${where}
      ORDER BY ar.date DESC, ar.clock_in
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }

  async getDuplicatePunches(tenantId: string, filter: ReportFilterDto) {
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
        e.employee_code,
        e.first_name || ' ' || e.last_name   AS employee_name,
        b.name                               AS branch,
        ar.punch_count,
        ar.source_device_id,
        ar.provider_name,
        ar.punch_sequence,
        COUNT(*) OVER()                      AS full_count
      FROM attendance_records ar
      JOIN employees e        ON ar.employee_id = e.id
      LEFT JOIN branches b    ON ar.branch_id = b.id
      WHERE ar.tenant_id = $1
        AND ar.punch_count > 2 ${where}
      ORDER BY ar.date DESC, ar.punch_count DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    return { data: rows, total: parseInt(rows[0]?.full_count ?? '0'), page, limit };
  }
}
