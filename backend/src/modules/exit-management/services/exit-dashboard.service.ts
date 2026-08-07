import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';

@Injectable()
export class ExitDashboardService {
  constructor(private readonly db: DatabaseService) {}

  async getStats(tenantId: string, accessScope?: AccessScope) {
    const scope = accessScope ? branchScopeClause(accessScope, 'er.branch_id', 2) : { clause: 'TRUE', params: [] };
    const params = [tenantId, ...scope.params];

    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE er.status = 'pending_approval') AS pending_requests,
         COUNT(*) FILTER (WHERE ar.status IN ('pending', 'under_review', 'escalated')) AS approvals_pending,
         COUNT(*) FILTER (WHERE er.status = 'notice_period') AS notice_period,
         COUNT(*) FILTER (WHERE er.status IN ('notice_period', 'clearance_in_progress')
           AND EXISTS (SELECT 1 FROM exit_clearances ec WHERE ec.exit_request_id = er.id AND ec.is_mandatory AND ec.status != 'cleared')) AS clearances_pending,
         COUNT(*) FILTER (WHERE er.status IN ('notice_period', 'clearance_in_progress')
           AND EXISTS (SELECT 1 FROM asset_assignments aa WHERE aa.exit_request_id = er.id AND aa.status = 'recovery_pending')) AS assets_pending,
         COUNT(*) FILTER (WHERE er.status = 'pending_settlement') AS fnf_pending,
         COUNT(*) FILTER (WHERE er.status IN ('notice_period', 'clearance_in_progress', 'pending_settlement')
           AND NOT EXISTS (SELECT 1 FROM exit_interviews ei WHERE ei.exit_request_id = er.id AND ei.status IN ('completed', 'skipped'))) AS interviews_pending,
         COUNT(*) FILTER (WHERE er.status = 'completed') AS completed_exits
       FROM exit_requests er
       LEFT JOIN approval_requests ar ON ar.entity_id = er.id AND ar.entity_table = 'exit_requests'
       WHERE er.tenant_id = $1 AND ${scope.clause}`,
      params,
    );

    const r = rows[0];
    return {
      pending_requests: parseInt(r.pending_requests, 10),
      approvals_pending: parseInt(r.approvals_pending, 10),
      notice_period: parseInt(r.notice_period, 10),
      clearances_pending: parseInt(r.clearances_pending, 10),
      assets_pending: parseInt(r.assets_pending, 10),
      fnf_pending: parseInt(r.fnf_pending, 10),
      interviews_pending: parseInt(r.interviews_pending, 10),
      completed_exits: parseInt(r.completed_exits, 10),
    };
  }

  async getMonthlyTrend(tenantId: string, months = 12) {
    const { rows } = await this.db.query(
      `SELECT to_char(date_trunc('month', requested_date), 'YYYY-MM') AS month, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE request_type = 'resignation') AS resignations,
              COUNT(*) FILTER (WHERE request_type = 'termination') AS terminations,
              COUNT(*) FILTER (WHERE request_type = 'retirement') AS retirements
       FROM exit_requests
       WHERE tenant_id = $1 AND requested_date >= date_trunc('month', now()) - ($2 || ' months')::interval
       GROUP BY 1 ORDER BY 1`,
      [tenantId, months],
    );
    return rows;
  }

  async getDepartmentTrend(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.name AS department, COUNT(*) AS total
       FROM exit_requests er
       JOIN employees e ON er.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE er.tenant_id = $1
       GROUP BY d.name ORDER BY total DESC`,
      [tenantId],
    );
    return rows;
  }

  async getBranchTrend(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT b.name AS branch, COUNT(*) AS total
       FROM exit_requests er
       LEFT JOIN branches b ON er.branch_id = b.id
       WHERE er.tenant_id = $1
       GROUP BY b.name ORDER BY total DESC`,
      [tenantId],
    );
    return rows;
  }

  async getAttritionReport(tenantId: string, filters: { from?: string; to?: string } = {}) {
    const params: any[] = [tenantId, 'completed'];
    let where = 'tenant_id = $1 AND status = $2';
    let idx = 3;
    if (filters.from) { where += ` AND requested_date >= $${idx++}`; params.push(filters.from); }
    if (filters.to) { where += ` AND requested_date <= $${idx++}`; params.push(filters.to); }

    const [summary, byReason] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) AS total_exits,
           ROUND(AVG(notice_period_days)::numeric, 1) AS avg_notice_period_days,
           ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400)::numeric, 1) AS avg_exit_duration_days
         FROM exit_requests WHERE ${where}`,
        params,
      ),
      this.db.query(`SELECT request_type, COUNT(*) AS total FROM exit_requests WHERE ${where} GROUP BY request_type`, params),
    ]);

    return {
      ...summary.rows[0],
      by_reason: Object.fromEntries(byReason.rows.map((r: any) => [r.request_type, parseInt(r.total, 10)])),
    };
  }
}
