import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

@Injectable()
export class BranchKpiService {
  constructor(private db: DatabaseService) {}

  async getKpis(tenantId: string, filters: { branch_id?: string; month?: number; year?: number }) {
    const month = filters.month ?? new Date().getMonth() + 1;
    const year  = filters.year  ?? new Date().getFullYear();

    const branchFilter = filters.branch_id ? `AND b.id = '${filters.branch_id}'` : '';

    // Pull per-branch headcount
    const { rows: headcounts } = await this.db.query(
      `SELECT b.id AS branch_id, b.name AS branch_name, b.code AS branch_code,
              b.branch_type, b.status,
              COUNT(e.id) FILTER (WHERE e.deleted_at IS NULL) AS headcount
       FROM branches b
       LEFT JOIN employees e ON e.branch_id = b.id AND e.tenant_id = b.tenant_id
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL ${branchFilter}
       GROUP BY b.id, b.name, b.code, b.branch_type, b.status
       ORDER BY b.name`,
      [tenantId],
    );

    if (!headcounts.length) return [];

    const branchIds = headcounts.map(r => r.branch_id);
    const bIdList   = branchIds.map((_: any, i: number) => `$${i + 2}`).join(',');

    // Attendance rate for the month
    const { rows: attRows } = await this.db.query(
      `SELECT branch_id,
              COUNT(*) FILTER (WHERE status IN ('present','late','half_day')) AS present_count,
              COUNT(*) AS total_records
       FROM attendance_records
       WHERE tenant_id = $1
         AND branch_id IN (${bIdList})
         AND EXTRACT(MONTH FROM date) = $${branchIds.length + 2}
         AND EXTRACT(YEAR  FROM date) = $${branchIds.length + 3}
       GROUP BY branch_id`,
      [tenantId, ...branchIds, month, year],
    );

    // Leave utilization for the month
    const { rows: leaveRows } = await this.db.query(
      `SELECT e.branch_id,
              SUM(lr.days)        AS days_taken,
              COUNT(lr.id)        AS leave_count
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.tenant_id = $1
         AND e.branch_id IN (${bIdList})
         AND lr.status = 'approved'
         AND EXTRACT(MONTH FROM lr.start_date) = $${branchIds.length + 2}
         AND EXTRACT(YEAR  FROM lr.start_date) = $${branchIds.length + 3}
       GROUP BY e.branch_id`,
      [tenantId, ...branchIds, month, year],
    );

    // Payroll net for the month
    const { rows: payrollRows } = await this.db.query(
      `SELECT branch_id,
              SUM(net_pay)        AS net_payroll,
              COUNT(id)           AS payslip_count,
              AVG(net_pay)        AS avg_net_pay
       FROM payslips
       WHERE tenant_id = $1
         AND branch_id IN (${bIdList})
         AND month = $${branchIds.length + 2}
         AND year  = $${branchIds.length + 3}
       GROUP BY branch_id`,
      [tenantId, ...branchIds, month, year],
    );

    // Device uptime
    const { rows: deviceRows } = await this.db.query(
      `SELECT branch_id,
              COUNT(*) FILTER (WHERE status = 'online') AS online_count,
              COUNT(*)                                   AS total_count
       FROM biometric_devices
       WHERE tenant_id = $1 AND branch_id IN (${bIdList}) AND deleted_at IS NULL
       GROUP BY branch_id`,
      [tenantId, ...branchIds],
    );

    // Open transfers (pending) per branch
    const { rows: transferRows } = await this.db.query(
      `SELECT to_branch_id AS branch_id, COUNT(*) AS pending_transfers
       FROM employee_branch_transfers
       WHERE tenant_id = $1 AND to_branch_id IN (${bIdList}) AND status = 'pending'
       GROUP BY to_branch_id`,
      [tenantId, ...branchIds],
    );

    // Pending leave requests per branch
    const { rows: pendingLeaveRows } = await this.db.query(
      `SELECT e.branch_id, COUNT(lr.id) AS pending_leaves
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.tenant_id = $1 AND e.branch_id IN (${bIdList}) AND lr.status = 'pending'
       GROUP BY e.branch_id`,
      [tenantId, ...branchIds],
    );

    // Index lookups
    const attMap      = Object.fromEntries(attRows.map(r  => [r.branch_id, r]));
    const leaveMap    = Object.fromEntries(leaveRows.map(r => [r.branch_id, r]));
    const payrollMap  = Object.fromEntries(payrollRows.map(r => [r.branch_id, r]));
    const deviceMap   = Object.fromEntries(deviceRows.map(r => [r.branch_id, r]));
    const transferMap = Object.fromEntries(transferRows.map(r => [r.branch_id, r]));
    const pendingLvMap= Object.fromEntries(pendingLeaveRows.map(r => [r.branch_id, r]));

    return headcounts.map(b => {
      const att     = attMap[b.branch_id]     || { present_count: 0, total_records: 0 };
      const lv      = leaveMap[b.branch_id]   || { days_taken: 0, leave_count: 0 };
      const pay     = payrollMap[b.branch_id] || { net_payroll: 0, payslip_count: 0, avg_net_pay: 0 };
      const dev     = deviceMap[b.branch_id]  || { online_count: 0, total_count: 0 };
      const tr      = transferMap[b.branch_id]|| { pending_transfers: 0 };
      const plv     = pendingLvMap[b.branch_id]||{ pending_leaves: 0 };

      const headcount       = parseInt(b.headcount) || 0;
      const presentCount    = parseInt(att.present_count) || 0;
      const totalRecords    = parseInt(att.total_records) || 0;
      const onlineDevices   = parseInt(dev.online_count) || 0;
      const totalDevices    = parseInt(dev.total_count) || 0;
      const netPayroll      = parseFloat(pay.net_payroll) || 0;

      return {
        branch_id:           b.branch_id,
        branch_name:         b.branch_name,
        branch_code:         b.branch_code,
        branch_type:         b.branch_type,
        status:              b.status,
        month,
        year,
        // Headcount KPI
        headcount,
        // Attendance KPIs
        attendance_rate:     totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : null,
        present_count:       presentCount,
        total_attendance_records: totalRecords,
        // Leave KPIs
        leave_days_taken:    parseFloat(lv.days_taken) || 0,
        leave_requests:      parseInt(lv.leave_count) || 0,
        pending_leave_requests: parseInt(plv.pending_leaves) || 0,
        // Payroll KPIs
        net_payroll:         netPayroll,
        payslip_count:       parseInt(pay.payslip_count) || 0,
        avg_net_pay:         parseFloat(pay.avg_net_pay) || 0,
        payroll_per_head:    headcount > 0 ? Math.round(netPayroll / headcount) : 0,
        // Device KPIs
        devices_online:      onlineDevices,
        devices_total:       totalDevices,
        device_uptime_pct:   totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : null,
        // Transfer KPIs
        pending_transfers:   parseInt(tr.pending_transfers) || 0,
      };
    });
  }

  async getTrend(
    tenantId: string,
    branchId: string,
    metric: 'attendance_rate' | 'net_payroll' | 'headcount',
    months: number = 6,
  ) {
    const results: any[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const [kpi] = await this.getKpis(tenantId, { branch_id: branchId, month: m, year: y });
      results.push({ month: m, year: y, value: kpi ? kpi[metric] : null });
    }

    return results;
  }
}
