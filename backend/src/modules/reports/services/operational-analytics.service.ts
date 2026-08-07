import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class OperationalAnalyticsService {
  constructor(private db: DatabaseService) {}

  async getSnapshot(tenantId: string, branchId?: string) {
    const branchFilter = branchId ? 'AND branch_id = $2' : '';
    const branchParam = branchId ? [tenantId, branchId] : [tenantId];

    const today = new Date().toISOString().split('T')[0];
    const todayParam = branchId ? [tenantId, today, branchId] : [tenantId, today];
    const todayBranchFilter = branchId ? 'AND ar.branch_id = $3' : '';

    const [workforce, todayAtt, branchSummary, recentPunches, leaveToday, pendingCorrections, devices] =
      await Promise.all([
        this.db.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE e.status = 'active') AS active
          FROM employees e
          WHERE e.tenant_id = $1
            AND e.deleted_at IS NULL
            ${branchId ? 'AND e.branch_id = $2' : ''}
        `, branchParam),

        this.db.query(`
          SELECT
            COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) AS present,
            COUNT(*) FILTER (WHERE ar.status = 'absent')             AS absent,
            COUNT(*) FILTER (WHERE ar.status = 'late')               AS late,
            COUNT(*) FILTER (WHERE ar.overtime_minutes > 0)          AS with_ot
          FROM attendance_records ar
          WHERE ar.tenant_id = $1
            AND ar.date = $2
            ${todayBranchFilter}
        `, todayParam),

        this.db.query(`
          SELECT
            b.name                                                       AS branch,
            COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))    AS present,
            COUNT(*) FILTER (WHERE ar.status = 'absent')                AS absent,
            COUNT(*)                                                     AS total,
            ROUND(
              COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0
                / NULLIF(COUNT(*), 0)::numeric, 1
            )                                                            AS pct
          FROM attendance_records ar
          JOIN branches b ON ar.branch_id = b.id
          WHERE ar.tenant_id = $1
            AND ar.date = $2
            ${todayBranchFilter}
          GROUP BY b.name
          ORDER BY pct DESC
        `, todayParam),

        this.db.query(`
          SELECT
            e.first_name || ' ' || e.last_name  AS employee_name,
            b.name                              AS branch,
            ar.clock_in                         AS punch_time,
            ar.status,
            ar.verify_method
          FROM attendance_records ar
          JOIN employees e        ON ar.employee_id = e.id
          LEFT JOIN branches b    ON ar.branch_id = b.id
          WHERE ar.tenant_id = $1
            AND ar.date = $2
            AND ar.clock_in IS NOT NULL
            ${todayBranchFilter}
          ORDER BY ar.clock_in DESC
          LIMIT 15
        `, todayParam),

        this.db.query(`
          SELECT COUNT(*) AS count
          FROM leave_requests lr
          JOIN employees e ON lr.employee_id = e.id
          WHERE lr.tenant_id = $1
            AND $2::date BETWEEN lr.start_date AND lr.end_date
            AND lr.status = 'approved'
            ${branchId ? 'AND e.branch_id = $3' : ''}
        `, todayParam),

        this.db.query(`
          SELECT COUNT(*) AS count
          FROM attendance_corrections ac
          JOIN employees e ON ac.employee_id = e.id
          WHERE ac.tenant_id = $1
            AND ac.status = 'pending'
            ${branchId ? 'AND e.branch_id = $2' : ''}
        `, branchParam),

        this.db.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE bd.is_online = TRUE) AS online,
            COUNT(*) FILTER (WHERE bd.is_active = TRUE) AS active
          FROM biometric_devices bd
          WHERE bd.tenant_id = $1
            ${branchId ? 'AND bd.branch_id = $2' : ''}
        `, branchParam),
      ]);

    const thisMonth = await this.db.query(`
      SELECT
        ROUND(
          COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0
            / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                 AS avg_attendance_pct,
        ROUND(SUM(ar.overtime_minutes) / 60.0::numeric, 2) AS total_ot_hours,
        COUNT(*) FILTER (WHERE ar.late_minutes > 0)       AS late_arrivals
      FROM attendance_records ar
      WHERE ar.tenant_id = $1
        AND ar.date >= DATE_TRUNC('month', CURRENT_DATE)
        ${branchId ? 'AND ar.branch_id = $2' : ''}
    `, branchParam);

    return {
      workforce: workforce.rows[0],
      today: todayAtt.rows[0],
      this_month: thisMonth.rows[0],
      branch_summary: branchSummary.rows,
      recent_punches: recentPunches.rows,
      leave_today: parseInt(leaveToday.rows[0]?.count ?? '0'),
      pending_corrections: parseInt(pendingCorrections.rows[0]?.count ?? '0'),
      devices: devices.rows[0],
      generated_at: new Date().toISOString(),
    };
  }

  async getAttendanceTrend(tenantId: string, branchId?: string, days = 30) {
    const params: any[] = [tenantId, days];
    const branchFilter = branchId ? 'AND ar.branch_id = $3' : '';
    if (branchId) params.push(branchId);

    const { rows } = await this.db.query(`
      SELECT
        ar.date,
        COUNT(*)                                                 AS total,
        COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) AS present,
        COUNT(*) FILTER (WHERE ar.status = 'absent')            AS absent,
        COUNT(*) FILTER (WHERE ar.status = 'late')              AS late,
        ROUND(
          COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) * 100.0
            / NULLIF(COUNT(*), 0)::numeric, 1
        )                                                        AS pct
      FROM attendance_records ar
      WHERE ar.tenant_id = $1
        AND ar.date >= CURRENT_DATE - ($2 || ' days')::interval
        ${branchFilter}
      GROUP BY ar.date
      ORDER BY ar.date
    `, params);

    return rows;
  }
}
