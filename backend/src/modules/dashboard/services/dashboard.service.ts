import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { ATTENDANCE_WORKFORCE_STATUS_SQL } from '../../../shared/employee-status.constants';

type DashboardAuthUser = {
  sub?: string;
  tenantId?: string | null;
  tenant_id?: string | null;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
  userType?: string;
  user_type?: string;
};

@Injectable()
export class DashboardService {
  constructor(private db: DatabaseService) {}

  private async resolveAccessScope(tenantId: string, user?: DashboardAuthUser): Promise<AccessScope> {
    if (!tenantId) return { isGlobalAccess: false, branchIds: [] };
    const isSuperAdmin = !!(user?.isSuperAdmin || user?.is_super_admin);
    const userType = user?.userType || user?.user_type;

    if (isSuperAdmin || userType === 'super_admin' || userType === 'org_admin') {
      return GLOBAL_ACCESS_SCOPE;
    }

    if (userType === 'branch_admin' || userType === 'admin') {
      const userId = user?.sub;
      if (!userId) return { isGlobalAccess: false, branchIds: [] };
      const { rows } = await this.db.query(
        `SELECT branch_id
         FROM branch_user_access
         WHERE tenant_id = $1 AND user_id = $2 AND role = 'branch_admin' AND is_active = TRUE`,
        [tenantId, userId],
      );
      return { isGlobalAccess: false, branchIds: rows.map((row) => row.branch_id) };
    }

    return { isGlobalAccess: false, branchIds: [] };
  }

  private withBranchPrefix(href: string, scope: AccessScope) {
    return scope.isGlobalAccess ? href : href.replace(/^\/dashboard/, '/branch-admin');
  }

  private unscopedRecordClause(scope: AccessScope): { clause: string; params: [] } {
    return { clause: scope.isGlobalAccess ? 'TRUE' : 'FALSE', params: [] };
  }

  async getSummary(tenantId: string, user?: DashboardAuthUser) {
    const scope = await this.resolveAccessScope(tenantId, user);
    const [overview, hr_metrics, finance_metrics] = await Promise.all([
      this.getOverview(tenantId, user, scope),
      this.getHrMetrics(tenantId, user, scope),
      this.getFinanceMetrics(tenantId, user, scope),
    ]);

    return { overview, hr_metrics, finance_metrics };
  }

  async getOverview(tenantId: string, user?: DashboardAuthUser, resolvedScope?: AccessScope) {
    const scope = resolvedScope ?? await this.resolveAccessScope(tenantId, user);
    const employeeScope = branchScopeClause(scope, 'e.branch_id', 2);
    const leaveScope = branchScopeClause(scope, 'e.branch_id', 2);
    const expenseScope = branchScopeClause(scope, 'branch_id', 2);
    const invoiceScope = this.unscopedRecordClause(scope);

    const [employees, attendanceWorkforce, attendance, leaves, expenses, invoices, presentToday, absentToday, lateToday, earlyLeaveToday] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) as total FROM employees e WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND ${employeeScope.clause}`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT COUNT(*) as total
         FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND ${employeeScope.clause}`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT ar.status, COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = CURRENT_DATE
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND ${employeeScope.clause}
         GROUP BY ar.status`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT lr.status, COUNT(*) as count
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
         WHERE lr.tenant_id = $1 AND ${leaveScope.clause}
         GROUP BY lr.status`,
        [tenantId, ...leaveScope.params],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = $1 AND status = 'approved' AND ${expenseScope.clause}`,
        [tenantId, ...expenseScope.params],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM gst_invoices WHERE tenant_id = $1 AND ${invoiceScope.clause}`,
        [tenantId, ...invoiceScope.params],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND ${employeeScope.clause}
           AND EXISTS (
             SELECT 1 FROM attendance_records ar
             WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
               AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
           )`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT COUNT(*) as count FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND ${employeeScope.clause}
           AND NOT EXISTS (
             SELECT 1 FROM attendance_records ar
             WHERE ar.tenant_id = e.tenant_id AND ar.employee_id = e.id
               AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
           )`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT ar.employee_id) as count
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
         WHERE ar.tenant_id = $1 AND ar.date = CURRENT_DATE AND ar.late_minutes > 0
           AND e.deleted_at IS NULL
           AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
           AND ${employeeScope.clause}`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT employee_id) as count FROM (
           SELECT lr.employee_id
           FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id AND e.tenant_id = lr.tenant_id
           WHERE lr.tenant_id = $1 AND lr.status = 'approved' AND lr.days = 0.5
             AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
             AND e.deleted_at IS NULL
             AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
             AND ${leaveScope.clause}
           UNION
           SELECT ar.employee_id
           FROM attendance_records ar
           JOIN employees e ON e.id = ar.employee_id AND e.tenant_id = ar.tenant_id
           LEFT JOIN shift_assignments sa ON sa.tenant_id = ar.tenant_id AND sa.employee_id = ar.employee_id
             AND sa.is_active = true AND sa.start_date <= ar.date AND (sa.end_date IS NULL OR sa.end_date >= ar.date)
           LEFT JOIN shift_definitions sd ON sd.id = sa.shift_id
           WHERE ar.tenant_id = $1 AND ar.date = CURRENT_DATE AND ar.clock_in IS NOT NULL
             AND e.deleted_at IS NULL
             AND e.status = ANY(${ATTENDANCE_WORKFORCE_STATUS_SQL})
             AND ${leaveScope.clause}
             AND (ar.clock_in AT TIME ZONE 'UTC')::time > COALESCE(sd.start_time + (sd.end_time - sd.start_time) / 2, TIME '12:00:00')
         ) early_leave_employees`,
        [tenantId, ...leaveScope.params],
      ),
    ]);

    const attendanceToday = attendance.rows.reduce((acc, r) => { acc[r.status] = parseInt(r.count); return acc; }, {});
    const leaveStatus = leaves.rows.reduce((acc, r) => { acc[r.status] = parseInt(r.count); return acc; }, {});

    return {
      total_employees: parseInt(employees.rows[0].total),
      attendance_workforce_total: parseInt(attendanceWorkforce.rows[0].total),
      present_today: parseInt(presentToday.rows[0].count),
      attendance_today: attendanceToday,
      leave_requests: leaveStatus,
      total_expenses: parseFloat(expenses.rows[0].total),
      total_invoices: parseFloat(invoices.rows[0].total),
      absent_today: parseInt(absentToday.rows[0].count),
      late_arrivals_today: parseInt(lateToday.rows[0].count),
      early_leave_today: parseInt(earlyLeaveToday.rows[0].count),
    };
  }

  async getHrMetrics(tenantId: string, user?: DashboardAuthUser, resolvedScope?: AccessScope) {
    const scope = resolvedScope ?? await this.resolveAccessScope(tenantId, user);
    const employeeScope = branchScopeClause(scope, 'e.branch_id', 2);

    const [byDept, byStatus, recentJoinees, upcomingProbation] = await Promise.all([
      this.db.query(
        `SELECT d.name, COUNT(e.id) as count
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND ${employeeScope.clause}
         GROUP BY d.name`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT e.status, COUNT(*) as count
         FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND ${employeeScope.clause}
         GROUP BY e.status`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT first_name, last_name, date_of_joining
         FROM employees e
         WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND ${employeeScope.clause}
         ORDER BY date_of_joining DESC LIMIT 5`,
        [tenantId, ...employeeScope.params],
      ),
      this.db.query(
        `SELECT first_name, last_name, probation_end_date
         FROM employees e
         WHERE e.tenant_id = $1 AND e.probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
           AND e.deleted_at IS NULL AND ${employeeScope.clause}`,
        [tenantId, ...employeeScope.params],
      ),
    ]);

    return { by_department: byDept.rows, by_status: byStatus.rows, recent_joinees: recentJoinees.rows, upcoming_probation: upcomingProbation.rows };
  }

  async getFinanceMetrics(tenantId: string, user?: DashboardAuthUser, resolvedScope?: AccessScope) {
    const scope = resolvedScope ?? await this.resolveAccessScope(tenantId, user);
    const expenseScope = branchScopeClause(scope, 'branch_id', 2);
    const invoiceScope = this.unscopedRecordClause(scope);

    const [monthlyExpenses, pendingExpenses, invoiceSummary] = await Promise.all([
      this.db.query(
        `SELECT EXTRACT(MONTH FROM date) as month, SUM(amount) as total
         FROM expenses
         WHERE tenant_id = $1 AND status = 'approved' AND date >= CURRENT_DATE - INTERVAL '6 months' AND ${expenseScope.clause}
         GROUP BY EXTRACT(MONTH FROM date) ORDER BY month`,
        [tenantId, ...expenseScope.params],
      ),
      this.db.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
         FROM expenses
         WHERE tenant_id = $1 AND status = 'pending' AND ${expenseScope.clause}`,
        [tenantId, ...expenseScope.params],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
         FROM gst_invoices
         WHERE tenant_id = $1 AND invoice_date >= CURRENT_DATE - INTERVAL '30 days' AND ${invoiceScope.clause}`,
        [tenantId, ...invoiceScope.params],
      ),
    ]);

    return {
      monthly_expenses: monthlyExpenses.rows,
      pending_expenses: { count: parseInt(pendingExpenses.rows[0].count), total: parseFloat(pendingExpenses.rows[0].total) },
      recent_invoices: { total: parseFloat(invoiceSummary.rows[0].total), count: parseInt(invoiceSummary.rows[0].count) },
    };
  }

  async getWidgets(tenantId: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM dashboard_widgets WHERE tenant_id = $1 AND is_active = true ORDER BY position',
      [tenantId],
    );
    return rows;
  }

  async saveWidget(tenantId: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO dashboard_widgets (tenant_id, name, type, config, position) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tenantId, data.name, data.type, data.config || {}, data.position || 0],
    );
    return rows[0];
  }

  async recordKpi(tenantId: string, metric: string, value: number, metadata?: any) {
    const { rows } = await this.db.query(
      'INSERT INTO kpi_snapshots (tenant_id, metric, value, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenantId, metric, value, metadata || {}],
    );
    return rows[0];
  }

  async getKpiHistory(tenantId: string, metric: string, days = 30) {
    const { rows } = await this.db.query(
      'SELECT * FROM kpi_snapshots WHERE tenant_id = $1 AND metric = $2 AND recorded_at >= CURRENT_DATE - INTERVAL \'$3 days\' ORDER BY recorded_at DESC',
      [tenantId, metric, days],
    );
    return rows;
  }

  async getNotifications(tenantId: string, userId: string, employeeId: string | null, isSuperAdmin: boolean, user?: DashboardAuthUser) {
    type NotifItem = { id: string; type: string; title: string; message: string; time: string; read: boolean; href?: string };
    const notifications: NotifItem[] = [];
    const scope = await this.resolveAccessScope(tenantId, user);
    const leaveScope = branchScopeClause(scope, 'e.branch_id', 2);
    const expenseScope = branchScopeClause(scope, 'branch_id', 2);
    const employeeScope = branchScopeClause(scope, 'branch_id', 2);
    const complianceScope = branchScopeClause(scope, 'branch_id', 2);
    const reviewScope = branchScopeClause(scope, 'e.branch_id', 2);
    const portalHref = (href: string) => this.withBranchPrefix(href, scope);

    // Determine if user has admin-level access for this tenant
    let isAdmin = isSuperAdmin;
    if (!isAdmin && (user?.userType === 'branch_admin' || user?.userType === 'admin')) {
      isAdmin = true;
    }
    if (!isAdmin && tenantId && userId) {
      try {
        const { rows } = await this.db.query(
          `SELECT 1 FROM user_tenants
           WHERE user_id = $1 AND tenant_id = $2
             AND (is_org_admin = true OR user_type IN ('org_admin', 'branch_admin', 'admin'))`,
          [userId, tenantId],
        );
        isAdmin = rows.length > 0;
      } catch (e) { /* table may not exist yet */ }
    }

    // Each source query is independent — fire them all concurrently instead of
    // one at a time. Every fetcher swallows its own errors (table may not
    // exist yet) and resolves to [] so Promise.all never short-circuits.
    const fetchers: Array<() => Promise<NotifItem[]>> = isAdmin
      ? [
          // Pending leave requests
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT lr.id, e.first_name, e.last_name, lr.created_at
                 FROM leave_requests lr
                 JOIN employees e ON lr.employee_id = e.id
                 WHERE lr.tenant_id = $1 AND ${leaveScope.clause} AND lr.status = 'pending'
                 ORDER BY lr.created_at DESC LIMIT 5`,
                [tenantId, ...leaveScope.params],
              );
              return rows.map(row => ({
                id: `leave-${row.id}`,
                type: 'leave',
                title: 'Leave Request Pending',
                message: `${row.first_name} ${row.last_name} has a pending leave request`,
                time: row.created_at,
                read: false,
                href: portalHref('/dashboard/hr/leave'),
              }));
            } catch (e) { return []; }
          },
          // Pending expenses
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, description, amount, created_at
                 FROM expenses
                 WHERE tenant_id = $1 AND ${expenseScope.clause} AND status = 'pending'
                 ORDER BY created_at DESC LIMIT 5`,
                [tenantId, ...expenseScope.params],
              );
              return rows.map(row => ({
                id: `expense-${row.id}`,
                type: 'expense',
                title: 'Expense Awaiting Approval',
                message: `₹${parseFloat(row.amount).toLocaleString('en-IN')} – ${row.description || 'Expense'}`,
                time: row.created_at,
                read: false,
                href: portalHref('/dashboard/finance/expenses'),
              }));
            } catch (e) { return []; }
          },
          // Recent joiners (last 7 days)
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, first_name, last_name, date_of_joining
                 FROM employees
                 WHERE tenant_id = $1 AND deleted_at IS NULL
                   AND ${employeeScope.clause}
                   AND date_of_joining >= CURRENT_DATE - INTERVAL '7 days'
                 ORDER BY date_of_joining DESC LIMIT 3`,
                [tenantId, ...employeeScope.params],
              );
              return rows.map(row => ({
                id: `joiner-${row.id}`,
                type: 'employee',
                title: 'New Employee Joined',
                message: `${row.first_name} ${row.last_name} joined the team`,
                time: row.date_of_joining,
                read: true,
                href: portalHref('/dashboard/hr/employees'),
              }));
            } catch (e) { return []; }
          },
          // Probation ending in next 14 days
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, first_name, last_name, probation_end_date
                 FROM employees
                 WHERE tenant_id = $1 AND deleted_at IS NULL
                   AND ${employeeScope.clause}
                   AND probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
                 ORDER BY probation_end_date ASC LIMIT 3`,
                [tenantId, ...employeeScope.params],
              );
              return rows.map(row => ({
                id: `probation-${row.id}`,
                type: 'alert',
                title: 'Probation Ending Soon',
                message: `${row.first_name} ${row.last_name}'s probation ends on ${new Date(row.probation_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                time: row.probation_end_date,
                read: false,
                href: portalHref('/dashboard/hr/employees'),
              }));
            } catch (e) { return []; }
          },
          // Compliance filings due in next 7 days
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, type, month, year, due_date
                 FROM compliance_filings
                 WHERE tenant_id = $1 AND status = 'pending'
                   AND ${complianceScope.clause}
                   AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                 ORDER BY due_date ASC LIMIT 5`,
                [tenantId, ...complianceScope.params],
              );
              const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              return rows.map(row => {
                const period = `${monthNames[(row.month as number) - 1]} ${row.year}`;
                return {
                  id: `filing-${row.id}`,
                  type: 'alert',
                  title: 'Compliance Filing Due',
                  message: `${(row.type as string).toUpperCase()} filing for ${period} is due on ${new Date(row.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                  time: row.due_date,
                  read: false,
                  href: portalHref('/dashboard/hr/compliance'),
                };
              });
            } catch (e) { return []; }
          },
          // Compliance documents expiring in next 30 days
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, name, document_type, expiry_date
                 FROM compliance_documents
                 WHERE tenant_id = $1 AND deleted_at IS NULL
                   AND ${complianceScope.clause}
                   AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                 ORDER BY expiry_date ASC LIMIT 3`,
                [tenantId, ...complianceScope.params],
              );
              return rows.map(row => ({
                id: `compdoc-${row.id}`,
                type: 'alert',
                title: 'Compliance Document Expiring',
                message: `${row.name} expires on ${new Date(row.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                time: row.expiry_date,
                read: false,
                href: portalHref('/dashboard/hr/compliance'),
              }));
            } catch (e) { return []; }
          },
          // Performance reviews submitted awaiting finalization
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT pr.id, e.first_name, e.last_name, rc.name as cycle_name, pr.updated_at
                 FROM performance_reviews pr
                 JOIN employees e ON pr.employee_id = e.id
                 JOIN review_cycles rc ON pr.cycle_id = rc.id
                 WHERE pr.tenant_id = $1 AND ${reviewScope.clause} AND pr.status = 'submitted'
                 ORDER BY pr.updated_at DESC LIMIT 5`,
                [tenantId, ...reviewScope.params],
              );
              return rows.map(row => ({
                id: `review-${row.id}`,
                type: 'employee',
                title: 'Performance Review Submitted',
                message: `${row.first_name} ${row.last_name}'s review for ${row.cycle_name} awaits finalization`,
                time: row.updated_at,
                read: false,
                href: portalHref('/dashboard/hr/performance'),
              }));
            } catch (e) { return []; }
          },
        ]
      : employeeId
      ? [
          // Own leave request status updates (last 30 days)
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT lr.id, lt.name as leave_type, lr.status, lr.start_date, lr.end_date, lr.updated_at
                 FROM leave_requests lr
                 LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
                 WHERE lr.tenant_id = $1 AND lr.employee_id = $2
                   AND lr.updated_at >= CURRENT_DATE - INTERVAL '30 days'
                 ORDER BY lr.updated_at DESC LIMIT 5`,
                [tenantId, employeeId],
              );
              return rows.map(row => {
                const from = new Date(row.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                const to = new Date(row.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                const statusLabel = row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending';
                return {
                  id: `leave-${row.id}`,
                  type: 'leave',
                  title: `Leave Request ${statusLabel}`,
                  message: `Your ${row.leave_type} request (${from} – ${to}) is ${row.status}`,
                  time: row.updated_at,
                  read: row.status === 'pending',
                  href: '/dashboard/hr/leave',
                };
              });
            } catch (e) { return []; }
          },
          // Own expense status updates (last 30 days)
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT id, description, amount, status, updated_at
                 FROM expenses
                 WHERE tenant_id = $1 AND employee_id = $2
                   AND updated_at >= CURRENT_DATE - INTERVAL '30 days'
                 ORDER BY updated_at DESC LIMIT 5`,
                [tenantId, employeeId],
              );
              return rows.map(row => {
                const statusLabel = row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending';
                return {
                  id: `expense-${row.id}`,
                  type: 'expense',
                  title: `Expense ${statusLabel}`,
                  message: `₹${parseFloat(row.amount).toLocaleString('en-IN')} – ${row.description || 'Expense'} is ${row.status}`,
                  time: row.updated_at,
                  read: row.status === 'pending',
                  href: '/dashboard/finance/expenses',
                };
              });
            } catch (e) { return []; }
          },
          // Own performance reviews (active cycles and recent updates)
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT pr.id, pr.status, pr.rating, pr.overall_score, rc.name as cycle_name, pr.updated_at
                 FROM performance_reviews pr
                 JOIN review_cycles rc ON pr.cycle_id = rc.id
                 WHERE pr.tenant_id = $1 AND pr.employee_id = $2
                 ORDER BY pr.updated_at DESC LIMIT 3`,
                [tenantId, employeeId],
              );
              const statusMap: Record<string, string> = { submitted: 'submitted for review', draft: 'in progress', finalized: 'finalized' };
              return rows.map(row => ({
                id: `review-${row.id}`,
                type: 'employee',
                title: 'Performance Review Update',
                message: `Your review for ${row.cycle_name} is ${statusMap[row.status] || row.status}${row.rating ? ` – ${row.rating}` : ''}`,
                time: row.updated_at,
                read: row.status === 'draft',
                href: '/dashboard/hr/performance',
              }));
            } catch (e) { return []; }
          },
          // Active review cycles the employee should be aware of
          async () => {
            try {
              const { rows } = await this.db.query(
                `SELECT rc.id, rc.name, rc.end_date
                 FROM review_cycles rc
                 WHERE rc.tenant_id = $1 AND rc.status = 'active'
                   AND rc.end_date >= CURRENT_DATE
                   AND NOT EXISTS (
                     SELECT 1 FROM performance_reviews pr
                     WHERE pr.cycle_id = rc.id AND pr.employee_id = $2 AND pr.tenant_id = $1
                   )
                 ORDER BY rc.end_date ASC LIMIT 2`,
                [tenantId, employeeId],
              );
              return rows.map(row => ({
                id: `cycle-${row.id}`,
                type: 'alert',
                title: 'Performance Review Due',
                message: `${row.name} review cycle is open – please submit your self-assessment by ${new Date(row.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                time: new Date().toISOString(),
                read: false,
                href: '/dashboard/hr/performance',
              }));
            } catch (e) { return []; }
          },
        ]
      : [];

    const results = await Promise.all(fetchers.map(fn => fn()));
    for (const items of results) notifications.push(...items);

    // Sort by time descending
    notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return { notifications, unread_count: notifications.filter(n => !n.read).length };
  }

  async globalSearch(tenantId: string, query: string, user?: DashboardAuthUser) {
    if (!query || query.trim().length < 2) return { results: [] };

    const scope = await this.resolveAccessScope(tenantId, user);
    const q = `%${query.trim()}%`;
    const employeeScope = branchScopeClause(scope, 'e.branch_id', 3);
    const departmentScope = branchScopeClause(scope, 'd.branch_id', 3);
    const invoiceScope = branchScopeClause(scope, 'branch_id', 3);
    const expenseScope = branchScopeClause(scope, 'ex.branch_id', 3);
    const reimbursementScope = branchScopeClause(scope, 'r.branch_id', 3);
    const leaveScope = branchScopeClause(scope, 'emp.branch_id', 3);
    const gstInvoiceScope = this.unscopedRecordClause(scope);

    type SearchResult = {
      id: string;
      type: string;
      title: string;
      subtitle: string;
      href: string;
      meta?: string;
    };

    // Each entity type is searched independently — fire all 8 queries
    // concurrently instead of one at a time. Every fetcher swallows its own
    // errors (table may not exist) and resolves to [] so Promise.all never
    // short-circuits.
    const fetchers: Array<() => Promise<SearchResult[]>> = [
      // 1. Employees
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.status,
                    d.name as department_name, des.name as designation_name
             FROM employees e
             LEFT JOIN departments d ON e.department_id = d.id
             LEFT JOIN designations des ON e.designation_id = des.id
             WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
               AND ${employeeScope.clause}
               AND (e.first_name ILIKE $2 OR e.last_name ILIKE $2 OR e.employee_code ILIKE $2
                    OR e.personal_email ILIKE $2 OR e.personal_phone ILIKE $2
                    OR (e.first_name || ' ' || e.last_name) ILIKE $2)
             ORDER BY e.first_name LIMIT 5`,
            [tenantId, q, ...employeeScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'employee',
            title: `${r.first_name} ${r.last_name}`,
            subtitle: [r.employee_code, r.designation_name, r.department_name].filter(Boolean).join(' · '),
            href: this.withBranchPrefix('/dashboard/hr/employees', scope),
            meta: r.status,
          }));
        } catch (e) { return []; }
      },
      // 2. Departments
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT d.id, d.name, d.code,
                    (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.tenant_id = $1 AND e.deleted_at IS NULL) as emp_count
             FROM departments d
             WHERE d.tenant_id = $1 AND d.deleted_at IS NULL AND ${departmentScope.clause}
               AND (d.name ILIKE $2 OR d.code ILIKE $2)
             ORDER BY d.name LIMIT 5`,
            [tenantId, q, ...departmentScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'department',
            title: r.name,
            subtitle: `${r.emp_count} employee${r.emp_count !== '1' ? 's' : ''}` + (r.code ? ` · ${r.code}` : ''),
            href: this.withBranchPrefix('/dashboard/hr/employees', scope),
          }));
        } catch (e) { return []; }
      },
      // 3. Invoices
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT id, invoice_number, customer_name, total_amount, status
             FROM invoices
             WHERE tenant_id = $1
               AND ${invoiceScope.clause}
               AND (invoice_number ILIKE $2 OR customer_name ILIKE $2)
             ORDER BY created_at DESC LIMIT 5`,
            [tenantId, q, ...invoiceScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'invoice',
            title: `${r.invoice_number} — ${r.customer_name}`,
            subtitle: `₹${parseFloat(r.total_amount).toLocaleString('en-IN')}`,
            href: this.withBranchPrefix('/dashboard/finance/invoices', scope),
            meta: r.status,
          }));
        } catch (e) { return []; }
      },
      // 4. Vendor Bills
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT id, bill_number, vendor_name, total_amount, status
             FROM vendor_bills
             WHERE tenant_id = $1
               AND ${invoiceScope.clause}
               AND (bill_number ILIKE $2 OR vendor_name ILIKE $2)
             ORDER BY created_at DESC LIMIT 5`,
            [tenantId, q, ...invoiceScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'bill',
            title: `${r.bill_number} — ${r.vendor_name}`,
            subtitle: `₹${parseFloat(r.total_amount).toLocaleString('en-IN')}`,
            href: this.withBranchPrefix('/dashboard/finance/bills', scope),
            meta: r.status,
          }));
        } catch (e) { return []; }
      },
      // 5. Expenses
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT ex.id, ex.category, ex.description, ex.amount, ex.status,
                    emp.first_name, emp.last_name
             FROM expenses ex
             LEFT JOIN employees emp ON ex.employee_id = emp.id
             WHERE ex.tenant_id = $1
               AND ${expenseScope.clause}
               AND (ex.description ILIKE $2 OR ex.category ILIKE $2
                    OR emp.first_name ILIKE $2 OR emp.last_name ILIKE $2)
             ORDER BY ex.created_at DESC LIMIT 5`,
            [tenantId, q, ...expenseScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'expense',
            title: r.description || r.category || 'Expense',
            subtitle: `₹${parseFloat(r.amount).toLocaleString('en-IN')}` + (r.first_name ? ` · ${r.first_name} ${r.last_name}` : ''),
            href: this.withBranchPrefix('/dashboard/finance/expenses', scope),
            meta: r.status,
          }));
        } catch (e) { return []; }
      },
      // 6. Reimbursements
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT r.id, r.claim_number, r.category, r.description, r.amount, r.status,
                    emp.first_name, emp.last_name
             FROM reimbursements r
             LEFT JOIN employees emp ON r.employee_id = emp.id
             WHERE r.tenant_id = $1
               AND ${reimbursementScope.clause}
               AND (r.claim_number ILIKE $2 OR r.description ILIKE $2 OR r.category ILIKE $2
                    OR emp.first_name ILIKE $2 OR emp.last_name ILIKE $2)
             ORDER BY r.created_at DESC LIMIT 5`,
            [tenantId, q, ...reimbursementScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'reimbursement',
            title: `${r.claim_number} — ${r.description || r.category}`,
            subtitle: `₹${parseFloat(r.amount).toLocaleString('en-IN')}` + (r.first_name ? ` · ${r.first_name} ${r.last_name}` : ''),
            href: this.withBranchPrefix('/dashboard/finance/reimbursements', scope),
            meta: r.status,
          }));
        } catch (e) { return []; }
      },
      // 7. Leave Requests
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT lr.id, lt.name as leave_type, lr.status, lr.start_date, lr.end_date,
                    emp.first_name, emp.last_name
             FROM leave_requests lr
             JOIN employees emp ON lr.employee_id = emp.id
             LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
             WHERE lr.tenant_id = $1
               AND ${leaveScope.clause}
               AND (lt.name ILIKE $2 OR emp.first_name ILIKE $2 OR emp.last_name ILIKE $2
                    OR (emp.first_name || ' ' || emp.last_name) ILIKE $2)
             ORDER BY lr.created_at DESC LIMIT 5`,
            [tenantId, q, ...leaveScope.params],
          );
          return rows.map(r => {
            const from = new Date(r.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const to = new Date(r.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return {
              id: r.id,
              type: 'leave',
              title: `${r.first_name} ${r.last_name} — ${r.leave_type}`,
              subtitle: `${from} → ${to}`,
              href: this.withBranchPrefix('/dashboard/hr/leave', scope),
              meta: r.status,
            };
          });
        } catch (e) { return []; }
      },
      // 8. GST Invoices
      async () => {
        try {
          const { rows } = await this.db.query(
            `SELECT id, invoice_number, customer_name, total_amount, invoice_type
             FROM gst_invoices
             WHERE tenant_id = $1
               AND ${gstInvoiceScope.clause}
               AND (invoice_number ILIKE $2 OR customer_name ILIKE $2)
             ORDER BY created_at DESC LIMIT 5`,
            [tenantId, q, ...gstInvoiceScope.params],
          );
          return rows.map(r => ({
            id: r.id,
            type: 'gst_invoice',
            title: `${r.invoice_number} — ${r.customer_name}`,
            subtitle: `₹${parseFloat(r.total_amount).toLocaleString('en-IN')} · ${r.invoice_type || 'GST'}`,
            href: this.withBranchPrefix('/dashboard/finance/gst', scope),
            meta: 'gst',
          }));
        } catch (e) { return []; }
      },
    ];

    const grouped = await Promise.all(fetchers.map(fn => fn()));
    return { results: grouped.flat() };
  }
}
