import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';

@Injectable()
export class BranchAnalyticsService {
  constructor(private db: DatabaseService) {}

  async getOverview(tenantId: string, accessScope: AccessScope = GLOBAL_ACCESS_SCOPE) {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const { rows } = await this.db.query(
      `SELECT
         b.id,
         b.name,
         b.code,
         b.display_name,
         b.branch_type,
         b.status,
         b.timezone,
         COUNT(DISTINCT e.id)
           FILTER (WHERE e.status = 'active' AND e.deleted_at IS NULL)           AS employee_count,
         COUNT(DISTINCT ar.id)
           FILTER (WHERE ar.date = $2 AND ar.status IN ('present','late','half_day'))
                                                                                 AS present_today,
         COUNT(DISTINCT ar.id)
           FILTER (WHERE ar.date = $2 AND ar.status = 'absent')                 AS absent_today,
         COUNT(DISTINCT bd.id)
           FILTER (WHERE bd.is_online = true  AND bd.deleted_at IS NULL)         AS devices_online,
         COUNT(DISTINCT bd.id)
           FILTER (WHERE bd.is_online = false AND bd.deleted_at IS NULL)         AS devices_offline,
         COUNT(DISTINCT bd.id)
           FILTER (WHERE bd.deleted_at IS NULL)                                  AS devices_total,
         COALESCE(SUM(ps.net_salary)
           FILTER (WHERE ps.month = $3 AND ps.year = $4
                     AND ps.status NOT IN ('cancelled','draft')), 0)             AS payroll_net_month,
         COUNT(DISTINCT ps.id)
           FILTER (WHERE ps.month = $3 AND ps.year = $4
                     AND ps.status NOT IN ('cancelled','draft'))                 AS payslip_count
       FROM branches b
       LEFT JOIN employees          e  ON e.branch_id  = b.id AND e.tenant_id  = $1
       LEFT JOIN attendance_records ar ON ar.branch_id = b.id AND ar.tenant_id = $1
       LEFT JOIN biometric_devices  bd ON bd.branch_id = b.id AND bd.tenant_id = $1
       LEFT JOIN payslips           ps ON ps.branch_id = b.id AND ps.tenant_id = $1
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         AND ${branchScopeClause(accessScope, 'b.id', 5).clause}
       GROUP BY b.id
       ORDER BY b.name ASC`,
      [tenantId, today, month, year, ...branchScopeClause(accessScope, 'b.id', 5).params],
    );
    return rows;
  }

  async getAttendanceSummary(
    tenantId: string,
    params: { branch_id?: string; date_from?: string; date_to?: string },
    accessScope: AccessScope = GLOBAL_ACCESS_SCOPE,
  ) {
    const today    = new Date().toISOString().split('T')[0];
    const dateFrom = params.date_from || today;
    const dateTo   = params.date_to   || today;

    const args: any[] = [tenantId, dateFrom, dateTo];
    let branchFilter = '';
    if (params.branch_id) {
      args.push(params.branch_id);
      branchFilter = `AND b.id = $${args.length}`;
    }
    const scope = branchScopeClause(accessScope, 'b.id', args.length + 1);
    const accessFilter = `AND ${scope.clause}`;
    args.push(...scope.params);

    const { rows } = await this.db.query(
      `SELECT
         b.id                                                              AS branch_id,
         b.name                                                            AS branch_name,
         b.code                                                            AS branch_code,
         COUNT(DISTINCT e.id)
           FILTER (WHERE e.status = 'active' AND e.deleted_at IS NULL)    AS headcount,
         COUNT(ar.id)                                                      AS total_records,
         COUNT(ar.id) FILTER (WHERE ar.status = 'present')                AS present,
         COUNT(ar.id) FILTER (WHERE ar.status = 'absent')                 AS absent,
         COUNT(ar.id) FILTER (WHERE ar.status = 'late')                   AS late,
         COUNT(ar.id) FILTER (WHERE ar.status = 'half_day')               AS half_day,
         COUNT(ar.id) FILTER (WHERE ar.status = 'on_leave')               AS on_leave,
         ROUND(AVG(ar.late_minutes)     FILTER (WHERE ar.late_minutes     > 0)) AS avg_late_minutes,
         ROUND(AVG(ar.overtime_minutes) FILTER (WHERE ar.overtime_minutes > 0)) AS avg_overtime_minutes
       FROM branches b
       LEFT JOIN employees          e  ON e.branch_id  = b.id AND e.tenant_id  = $1
       LEFT JOIN attendance_records ar ON ar.branch_id = b.id AND ar.tenant_id = $1
                                      AND ar.date BETWEEN $2 AND $3
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL ${branchFilter} ${accessFilter}
       GROUP BY b.id, b.name, b.code
       ORDER BY b.name ASC`,
      args,
    );
    return rows;
  }

  async getPayrollSummary(
    tenantId: string,
    params: { branch_id?: string; month?: number; year?: number },
    accessScope: AccessScope = GLOBAL_ACCESS_SCOPE,
  ) {
    const now   = new Date();
    const month = params.month ?? now.getMonth() + 1;
    const year  = params.year  ?? now.getFullYear();

    const args: any[] = [tenantId, month, year];
    let branchFilter = '';
    if (params.branch_id) {
      args.push(params.branch_id);
      branchFilter = `AND b.id = $${args.length}`;
    }
    const scope = branchScopeClause(accessScope, 'b.id', args.length + 1);
    const accessFilter = `AND ${scope.clause}`;
    args.push(...scope.params);

    const { rows } = await this.db.query(
      `SELECT
         b.id                                                              AS branch_id,
         b.name                                                            AS branch_name,
         b.code                                                            AS branch_code,
         COUNT(DISTINCT e.id)
           FILTER (WHERE e.status = 'active' AND e.deleted_at IS NULL)    AS headcount,
         COUNT(ps.id)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft'))           AS payslip_count,
         COALESCE(SUM(ps.gross_salary)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft')), 0)       AS total_gross,
         COALESCE(SUM(ps.total_deductions)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft')), 0)       AS total_deductions,
         COALESCE(SUM(ps.net_salary)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft')), 0)       AS total_net,
         COALESCE(SUM(ps.pf)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft')), 0)       AS total_pf,
         COALESCE(SUM(ps.esi)
           FILTER (WHERE ps.month = $2 AND ps.year = $3
                     AND ps.status NOT IN ('cancelled','draft')), 0)       AS total_esi
       FROM branches b
       LEFT JOIN employees e  ON e.branch_id  = b.id AND e.tenant_id = $1
       LEFT JOIN payslips  ps ON ps.branch_id = b.id AND ps.tenant_id = $1
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL ${branchFilter} ${accessFilter}
       GROUP BY b.id, b.name, b.code
       ORDER BY b.name ASC`,
      args,
    );
    return rows;
  }

  async getDeviceHealth(tenantId: string, branchId?: string, accessScope: AccessScope = GLOBAL_ACCESS_SCOPE) {
    const args: any[] = [tenantId];
    let branchFilter = '';
    if (branchId) {
      args.push(branchId);
      branchFilter = `AND b.id = $${args.length}`;
    }
    const scope = branchScopeClause(accessScope, 'b.id', args.length + 1);
    const accessFilter = `AND ${scope.clause}`;
    args.push(...scope.params);

    const { rows } = await this.db.query(
      `SELECT
         b.id                                                              AS branch_id,
         b.name                                                            AS branch_name,
         b.code                                                            AS branch_code,
         COUNT(bd.id)                                                      AS total_devices,
         COUNT(bd.id) FILTER (WHERE bd.is_online = true)                  AS online,
         COUNT(bd.id) FILTER (WHERE bd.is_online = false)                 AS offline,
         COUNT(bd.id) FILTER (WHERE bd.is_active = true)                  AS active_devices,
         MAX(bd.last_seen_at)                                              AS latest_heartbeat,
         COALESCE(
           json_agg(
             json_build_object(
               'id',             bd.id,
               'name',           COALESCE(bd.name, bd.serial_number),
               'serial_number',  bd.serial_number,
               'hardware_type',  bd.hardware_type,
               'is_online',      bd.is_online,
               'is_active',      bd.is_active,
               'last_seen_at',   bd.last_seen_at,
               'ip_address',     bd.ip_address
             ) ORDER BY bd.name ASC NULLS LAST
           ) FILTER (WHERE bd.id IS NOT NULL),
           '[]'
         )                                                                 AS devices
       FROM branches b
       LEFT JOIN biometric_devices bd ON bd.branch_id = b.id
                                      AND bd.tenant_id = $1
                                      AND bd.deleted_at IS NULL
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL ${branchFilter} ${accessFilter}
       GROUP BY b.id, b.name, b.code
       ORDER BY b.name ASC`,
      args,
    );
    return rows;
  }

  async exportCsv(
    tenantId: string,
    opts: { type: string; branch_id?: string; date_from?: string; date_to?: string; month?: number; year?: number },
    accessScope: AccessScope = GLOBAL_ACCESS_SCOPE,
  ): Promise<{ csv: string; filename: string }> {
    const { type } = opts;

    if (type === 'attendance') {
      const rows = await this.getAttendanceSummary(tenantId, {
        branch_id: opts.branch_id,
        date_from: opts.date_from,
        date_to:   opts.date_to,
      }, accessScope);
      const headers = ['Branch', 'Code', 'Headcount', 'Present', 'Absent', 'Late', 'Half Day', 'On Leave', 'Avg Late (min)'];
      const lines = rows.map((r: any) =>
        [r.branch_name, r.branch_code, r.headcount, r.present, r.absent, r.late, r.half_day, r.on_leave, r.avg_late_minutes ?? ''].join(','),
      );
      const date = opts.date_from || new Date().toISOString().split('T')[0];
      return { csv: [headers.join(','), ...lines].join('\n'), filename: `attendance_summary_${date}.csv` };
    }

    if (type === 'payroll') {
      const rows = await this.getPayrollSummary(tenantId, { branch_id: opts.branch_id, month: opts.month, year: opts.year }, accessScope);
      const headers = ['Branch', 'Code', 'Headcount', 'Gross', 'Deductions', 'Net', 'PF', 'ESI'];
      const lines = rows.map((r: any) =>
        [r.branch_name, r.branch_code, r.headcount, r.gross, r.deductions, r.net, r.pf, r.esi].join(','),
      );
      const m = opts.month ?? new Date().getMonth() + 1;
      const y = opts.year  ?? new Date().getFullYear();
      return { csv: [headers.join(','), ...lines].join('\n'), filename: `payroll_summary_${y}_${String(m).padStart(2,'0')}.csv` };
    }

    if (type === 'employees') {
      const args: any[] = [tenantId];
      let branchFilter = '';
      if (opts.branch_id) {
        args.push(opts.branch_id);
        branchFilter = `AND e.branch_id = $${args.length}`;
      }
      const scope = branchScopeClause(accessScope, 'e.branch_id', args.length + 1);
      const accessFilter = `AND ${scope.clause}`;
      args.push(...scope.params);

      const { rows } = await this.db.query(
        `SELECT e.employee_code, e.first_name, e.last_name, e.email, e.phone,
                b.name AS branch_name, d.name AS department_name,
                e.status, e.joining_date
         FROM employees e
         LEFT JOIN branches    b ON b.id = e.branch_id
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL ${branchFilter} ${accessFilter}
         ORDER BY b.name, e.first_name`,
        args,
      );
      const headers = ['Code', 'First Name', 'Last Name', 'Email', 'Phone', 'Branch', 'Department', 'Status', 'Joining Date'];
      const lines = rows.map((r: any) =>
        [r.employee_code, r.first_name, r.last_name, r.email ?? '', r.phone ?? '',
         r.branch_name ?? '', r.department_name ?? '', r.status ?? '', r.joining_date ?? ''].join(','),
      );
      return { csv: [headers.join(','), ...lines].join('\n'), filename: `employees_${new Date().toISOString().split('T')[0]}.csv` };
    }

    return { csv: '', filename: 'export.csv' };
  }
}
