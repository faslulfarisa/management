import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { SchedulerControlService } from '../../../shared/scheduler-control.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { NotificationEmitterService } from './notification-emitter.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';

export interface NotificationActor {
  sub: string;
  tenantId: string;
  userType: string;
  isSuperAdmin: boolean;
  employeeId?: string | null;
}

export interface ListFilters {
  page?: number;
  limit?: number;
  type?: string;
  priority?: string;
  source_module?: string;
  branch_id?: string;
  department_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

function deriveNotificationActionType(row: any): string {
  const metadata = row?.metadata ?? {};
  const explicit = metadata.action_type ?? metadata.actionType;
  if (explicit) return String(explicit).toUpperCase();

  const title = `${row?.title ?? ''} ${row?.message ?? ''}`.toLowerCase();
  if (row?.type === 'approval' || title.includes('approval') || title.includes('approve')) return 'APPROVE';
  if (title.includes('reject')) return 'REJECT';
  if (title.includes('download') || row?.entity_type === 'payslip') return 'DOWNLOAD';
  if (row?.action_url || row?.entity_id) return 'DETAILS';
  return 'VIEW';
}

function withActionPayload(row: any) {
  return {
    ...row,
    action_type: deriveNotificationActionType(row),
    module: row.source_module,
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private approvalEngine: ApprovalEngineService,
    private emitter: NotificationEmitterService,
    private schedulerControl: SchedulerControlService = new SchedulerControlService(),
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Visibility helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Returns the SQL clause + params restricting `notifications` rows to what `actor` may see. */
  private visibilityClause(actor: NotificationActor, accessScope: AccessScope, idx: number): { clause: string; params: any[]; nextIdx: number } {
    if (actor.userType === 'employee') {
      return { clause: `n.user_id = $${idx}`, params: [actor.sub], nextIdx: idx + 1 };
    }
    if (accessScope.isGlobalAccess) {
      return { clause: `(n.user_id = $${idx} OR n.user_id IS NULL)`, params: [actor.sub], nextIdx: idx + 1 };
    }
    const scope = branchScopeClause(accessScope, 'n.branch_id', idx + 1);
    return {
      clause: `(n.user_id = $${idx} OR (n.user_id IS NULL AND (n.branch_id IS NULL OR ${scope.clause})))`,
      params: [actor.sub, ...scope.params],
      nextIdx: idx + 1 + scope.params.length,
    };
  }

  /** Returns the SQL clause + params restricting employee-linked rows (alias `e`) to the actor's scope. */
  private employeeScopeClause(actor: NotificationActor, accessScope: AccessScope, alias: string, idx: number): { clause: string; params: any[]; nextIdx: number } {
    if (actor.userType === 'employee') {
      return { clause: `${alias}.id = $${idx}`, params: [actor.employeeId || null], nextIdx: idx + 1 };
    }
    const scope = branchScopeClause(accessScope, `${alias}.branch_id`, idx);
    return { clause: scope.clause, params: scope.params, nextIdx: idx + scope.params.length };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core feed
  // ─────────────────────────────────────────────────────────────────────────

  async list(actor: NotificationActor, accessScope: AccessScope, filters: ListFilters) {
    const { page = 1, limit = 20 } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    const params: any[] = [actor.tenantId];
    let idx = 2;
    let query = `FROM notifications n WHERE n.tenant_id = $1`;

    const vis = this.visibilityClause(actor, accessScope, idx);
    query += ` AND ${vis.clause}`;
    params.push(...vis.params);
    idx = vis.nextIdx;

    if (filters.type) { query += ` AND n.type = $${idx++}`; params.push(filters.type); }
    if (filters.priority) { query += ` AND n.priority = $${idx++}`; params.push(filters.priority); }
    if (filters.source_module) { query += ` AND n.source_module = $${idx++}`; params.push(filters.source_module); }
    if (filters.branch_id) { query += ` AND n.branch_id = $${idx++}`; params.push(filters.branch_id); }
    if (filters.department_id) { query += ` AND n.department_id = $${idx++}`; params.push(filters.department_id); }
    if (filters.status) { query += ` AND n.status = $${idx++}`; params.push(filters.status); }
    else { query += ` AND n.status = 'active'`; }
    if (filters.date_from) { query += ` AND n.created_at >= $${idx++}`; params.push(filters.date_from); }
    if (filters.date_to) { query += ` AND n.created_at <= $${idx++}`; params.push(filters.date_to); }
    if (filters.search) { query += ` AND (n.title ILIKE $${idx} OR n.message ILIKE $${idx})`; params.push(`%${filters.search}%`); idx++; }

    const dataQuery = query.replace(
      'FROM notifications n WHERE',
      'FROM notifications n LEFT JOIN branches b ON b.id = n.branch_id LEFT JOIN departments d ON d.id = n.department_id WHERE',
    );
    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${query}`, params),
      this.db.query(
        `SELECT n.*, b.name AS branch_name, d.name AS department_name
         ${dataQuery}
         ORDER BY n.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows.map(withActionPayload), total, page: Number(page), limit: Number(limit) };
  }

  async markRead(id: string, actor: NotificationActor) {
    const { rows } = await this.db.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING *`,
      [id, actor.tenantId, actor.sub],
    );
    if (!rows.length) throw new NotFoundException('Notification not found');
    await this.auditLog.log({ tenantId: actor.tenantId, userId: actor.sub, entityType: 'notification', entityId: id, action: 'notification_read' });
    return withActionPayload(rows[0]);
  }

  async markUnread(id: string, actor: NotificationActor) {
    const { rows } = await this.db.query(
      `UPDATE notifications SET is_read = false WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING *`,
      [id, actor.tenantId, actor.sub],
    );
    if (!rows.length) throw new NotFoundException('Notification not found');
    return withActionPayload(rows[0]);
  }

  async archive(id: string, actor: NotificationActor) {
    const { rows } = await this.db.query(
      `UPDATE notifications SET status = 'archived' WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING *`,
      [id, actor.tenantId, actor.sub],
    );
    if (!rows.length) throw new NotFoundException('Notification not found');
    await this.auditLog.log({ tenantId: actor.tenantId, userId: actor.sub, entityType: 'notification', entityId: id, action: 'notification_archived' });
    return withActionPayload(rows[0]);
  }

  async markAllRead(actor: NotificationActor) {
    await this.db.query(
      `UPDATE notifications SET is_read = true WHERE tenant_id = $1 AND user_id = $2 AND is_read = false`,
      [actor.tenantId, actor.sub],
    );
    await this.auditLog.log({ tenantId: actor.tenantId, userId: actor.sub, entityType: 'notification', entityId: actor.sub, action: 'notification_read_all' });
    return { success: true };
  }

  async getUnreadCount(actor: NotificationActor) {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) FROM notifications WHERE tenant_id = $1 AND user_id = $2 AND is_read = false AND status = 'active'`,
      [actor.tenantId, actor.sub],
    );
    return parseInt(rows[0].count, 10);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Overview cards
  // ─────────────────────────────────────────────────────────────────────────

  async getOverview(actor: NotificationActor, accessScope: AccessScope) {
    const [pendingApprovals, unread, critical, today, attendance, payroll, employeeEvents] = await Promise.all([
      this.approvalEngine.getPendingCount(actor.tenantId, actor.sub, actor.isSuperAdmin, accessScope),
      this.getUnreadCount(actor),
      this.countNotifications(actor, accessScope, `priority = 'critical' AND status = 'active'`),
      this.countNotifications(actor, accessScope, `created_at >= CURRENT_DATE`),
      this.getAttendanceAlerts(actor, accessScope, {}),
      this.getPayrollAlerts(actor, accessScope, {}),
      this.getEmployeeEvents(actor, accessScope, {}),
    ]);

    return {
      pending_approvals: pendingApprovals,
      unread_notifications: unread,
      critical_alerts: critical,
      todays_activities: today,
      attendance_exceptions: attendance.total,
      payroll_alerts: payroll.total,
      employee_lifecycle_events: employeeEvents.total,
    };
  }

  private async countNotifications(actor: NotificationActor, accessScope: AccessScope, extraWhere: string) {
    const params: any[] = [actor.tenantId];
    let idx = 2;
    let query = `SELECT COUNT(*) FROM notifications n WHERE n.tenant_id = $1`;
    const vis = this.visibilityClause(actor, accessScope, idx);
    query += ` AND ${vis.clause}`;
    params.push(...vis.params);
    query += ` AND n.${extraWhere}`;
    const { rows } = await this.db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Action Required (delegates to the approval engine inbox)
  // ─────────────────────────────────────────────────────────────────────────

  async getActionRequired(actor: NotificationActor, accessScope: AccessScope, filters: { page?: number; limit?: number; workflowType?: string; branchId?: string; priority?: string }) {
    const workflowTypes = ['leave', 'overtime', 'shift_change', 'attendance_correction', 'payroll'];
    if (filters.workflowType) {
      return this.approvalEngine.getInbox(actor.tenantId, actor.sub, actor.isSuperAdmin, filters, accessScope);
    }
    // No specific workflow type requested — fetch each in parallel and merge.
    const { page = 1, limit = 20 } = filters;
    const results = await Promise.all(
      workflowTypes.map((wt) => this.approvalEngine.getInbox(actor.tenantId, actor.sub, actor.isSuperAdmin, { ...filters, workflowType: wt, page: 1, limit: 100 }, accessScope)),
    );
    const merged = results.flatMap((r) => r.data);
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = merged.length;
    const offset = (Number(page) - 1) * Number(limit);
    return { data: merged.slice(offset, offset + Number(limit)), total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Attendance Alerts
  // ─────────────────────────────────────────────────────────────────────────

  async getAttendanceAlerts(actor: NotificationActor, accessScope: AccessScope, filters: { branch_id?: string; department_id?: string; employee_id?: string }) {
    const buildEmpFilters = (alias: string, startIdx: number) => {
      const params: any[] = [];
      let clause = '';
      let idx = startIdx;
      const scope = this.employeeScopeClause(actor, accessScope, alias, idx);
      clause += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx = scope.nextIdx;
      if (filters.branch_id) { clause += ` AND ${alias}.branch_id = $${idx++}`; params.push(filters.branch_id); }
      if (filters.department_id) { clause += ` AND ${alias}.department_id = $${idx++}`; params.push(filters.department_id); }
      if (filters.employee_id) { clause += ` AND ${alias}.id = $${idx++}`; params.push(filters.employee_id); }
      return { clause, params, nextIdx: idx };
    };

    const lateF = buildEmpFilters('e', 2);
    const lateArrivals = await this.db.query(
      `SELECT ar.id, ar.date, ar.late_minutes, ar.clock_in, e.id AS employee_id,
              e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ar.tenant_id = $1 AND ar.late_minutes > 0 AND ar.date = CURRENT_DATE${lateF.clause}
       ORDER BY ar.late_minutes DESC LIMIT 50`,
      [actor.tenantId, ...lateF.params],
    );

    const missingF = buildEmpFilters('e', 2);
    const missingPunches = await this.db.query(
      `SELECT ar.id, ar.date, ar.clock_in, ar.clock_out, e.id AS employee_id,
              e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ar.tenant_id = $1 AND ar.date = CURRENT_DATE
         AND (ar.clock_in IS NULL OR ar.clock_out IS NULL) AND ar.status != 'absent'${missingF.clause}
       ORDER BY ar.date DESC LIMIT 50`,
      [actor.tenantId, ...missingF.params],
    );

    const absentF = buildEmpFilters('e', 2);
    const absent = await this.db.query(
      `SELECT ar.id, ar.date, e.id AS employee_id,
              e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ar.tenant_id = $1 AND ar.date = CURRENT_DATE AND ar.status = 'absent'${absentF.clause}
       ORDER BY e.first_name LIMIT 50`,
      [actor.tenantId, ...absentF.params],
    );

    const breakF = buildEmpFilters('e', 2);
    const breakViolations = await this.db.query(
      `SELECT bs.id, bs.date, bs.reason_label, bs.overdue_minutes, e.id AS employee_id,
              e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM break_sessions bs
       JOIN employees e ON e.id = bs.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE bs.tenant_id = $1 AND bs.is_overdue = true AND bs.date = CURRENT_DATE${breakF.clause}
       ORDER BY bs.overdue_minutes DESC LIMIT 50`,
      [actor.tenantId, ...breakF.params],
    );

    // Biometric sync failures are device/integration-level, not employee-level.
    let biometricSyncFailures: any[] = [];
    if (actor.userType !== 'employee') {
      const { rows } = await this.db.query(
        `SELECT id, provider_name, status, error_summary, started_at, completed_at
         FROM biometric_sync_logs
         WHERE tenant_id = $1 AND status = 'failed' AND started_at >= now() - interval '24 hours'
         ORDER BY started_at DESC LIMIT 50`,
        [actor.tenantId],
      );
      biometricSyncFailures = rows;
    }

    const earlyExits: any[] = [];

    const data = {
      late_arrivals: lateArrivals.rows,
      missing_punches: missingPunches.rows,
      absent: absent.rows,
      early_exits: earlyExits,
      break_violations: breakViolations.rows,
      biometric_sync_failures: biometricSyncFailures,
    };
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    return { data, total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Payroll Alerts
  // ─────────────────────────────────────────────────────────────────────────

  async getPayrollAlerts(actor: NotificationActor, accessScope: AccessScope, filters: { branch_id?: string }) {
    const buildEmpFilters = (alias: string, startIdx: number) => {
      const params: any[] = [];
      let clause = '';
      let idx = startIdx;
      const scope = this.employeeScopeClause(actor, accessScope, alias, idx);
      clause += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx = scope.nextIdx;
      if (filters.branch_id) { clause += ` AND ${alias}.branch_id = $${idx++}`; params.push(filters.branch_id); }
      return { clause, params, nextIdx: idx };
    };

    const bankF = buildEmpFilters('e', 2);
    const missingBankDetails = await this.db.query(
      `SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL${bankF.clause}
         AND NOT EXISTS (
           SELECT 1 FROM employee_bank_accounts eba
           WHERE eba.employee_id = e.id AND eba.deleted_at IS NULL AND eba.verification_status = 'verified'
         )
       ORDER BY e.first_name LIMIT 50`,
      [actor.tenantId, ...bankF.params],
    );

    const payslipF = buildEmpFilters('e', 2);
    const pendingPayslips = await this.db.query(
      `SELECT p.id, p.month, p.year, p.status, e.id AS employee_id,
              e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM payslips p
       JOIN employees e ON e.id = p.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE p.tenant_id = $1 AND p.status = 'draft'${payslipF.clause}
       ORDER BY p.year DESC, p.month DESC LIMIT 50`,
      [actor.tenantId, ...payslipF.params],
    );

    let payrollApprovalPending: any[] = [];
    if (actor.userType !== 'employee') {
      const inbox = await this.approvalEngine.getInbox(actor.tenantId, actor.sub, actor.isSuperAdmin, { workflowType: 'payroll', page: 1, limit: 50 }, accessScope);
      payrollApprovalPending = inbox.data;
    }

    const fineF = buildEmpFilters('e', 2);
    const fineDeductionChanges = await this.db.query(
      `SELECT fdah.id, fdah.field_changed, fdah.old_value, fdah.new_value, fdah.change_reason, fdah.created_at,
              e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM fine_deduction_audit_history fdah
       JOIN employee_fines ef ON ef.id = fdah.fine_id
       JOIN employees e ON e.id = ef.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE fdah.tenant_id = $1 AND fdah.created_at >= now() - interval '7 days'${fineF.clause}
       ORDER BY fdah.created_at DESC LIMIT 50`,
      [actor.tenantId, ...fineF.params],
    );

    const data = {
      missing_bank_details: missingBankDetails.rows,
      pending_payslip_generation: pendingPayslips.rows,
      payroll_approval_pending: payrollApprovalPending,
      fine_deduction_changes: fineDeductionChanges.rows,
      salary_structure_issues: [] as any[],
      failed_payroll_processing: [] as any[],
    };
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    return { data, total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Employee Events
  // ─────────────────────────────────────────────────────────────────────────

  async getEmployeeEvents(actor: NotificationActor, accessScope: AccessScope, filters: { branch_id?: string }) {
    const buildEmpFilters = (alias: string, startIdx: number) => {
      const params: any[] = [];
      let clause = '';
      let idx = startIdx;
      const scope = this.employeeScopeClause(actor, accessScope, alias, idx);
      clause += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx = scope.nextIdx;
      if (filters.branch_id) { clause += ` AND ${alias}.branch_id = $${idx++}`; params.push(filters.branch_id); }
      return { clause, params, nextIdx: idx };
    };

    const joinersF = buildEmpFilters('e', 2);
    const newJoiners = await this.db.query(
      `SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.date_of_joining, e.branch_id, b.name AS branch_name
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND e.date_of_joining >= CURRENT_DATE - interval '30 days'${joinersF.clause}
       ORDER BY e.date_of_joining DESC LIMIT 50`,
      [actor.tenantId, ...joinersF.params],
    );

    const probationF = buildEmpFilters('e', 2);
    const probationEnding = await this.db.query(
      `SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.probation_end_date, e.branch_id, b.name AS branch_name
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = $1 AND e.deleted_at IS NULL
         AND e.probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '14 days'${probationF.clause}
       ORDER BY e.probation_end_date ASC LIMIT 50`,
      [actor.tenantId, ...probationF.params],
    );

    const confirmedF = buildEmpFilters('e', 2);
    const confirmed = await this.db.query(
      `SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.confirmation_date, e.branch_id, b.name AS branch_name
       FROM employees e
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.tenant_id = $1 AND e.deleted_at IS NULL AND e.confirmation_date >= CURRENT_DATE - interval '30 days'${confirmedF.clause}
       ORDER BY e.confirmation_date DESC LIMIT 50`,
      [actor.tenantId, ...confirmedF.params],
    );

    const resignF = buildEmpFilters('e', 2);
    const resignations = await this.db.query(
      `SELECT er.id, er.request_type, er.status, er.last_working_date, er.created_at,
              e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM exit_requests er
       JOIN employees e ON e.id = er.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE er.tenant_id = $1 AND er.request_type = 'resignation' AND er.created_at >= now() - interval '30 days'${resignF.clause}
       ORDER BY er.created_at DESC LIMIT 50`,
      [actor.tenantId, ...resignF.params],
    );

    const statusF = buildEmpFilters('e', 2);
    const statusChanges = await this.db.query(
      `SELECT ush.id, ush.previous_status, ush.new_status, ush.changed_at,
              e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM user_status_history ush
       JOIN users u ON u.id = ush.user_id
       JOIN employees e ON e.id = u.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ush.tenant_id = $1 AND ush.changed_at >= now() - interval '30 days'${statusF.clause}
       ORDER BY ush.changed_at DESC LIMIT 50`,
      [actor.tenantId, ...statusF.params],
    );
    const retired = statusChanges.rows.filter((r) => r.new_status === 'retired');
    const otherStatusChanges = statusChanges.rows.filter((r) => r.new_status !== 'retired');

    const transferF = buildEmpFilters('e', 2);
    const transfers = await this.db.query(
      `SELECT t.id, t.status, t.effective_date, t.created_at,
              e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name,
              fb.name AS from_branch_name, tb.name AS to_branch_name, e.branch_id
       FROM employee_branch_transfers t
       JOIN employees e ON e.id = t.employee_id
       LEFT JOIN branches fb ON fb.id = t.from_branch_id
       LEFT JOIN branches tb ON tb.id = t.to_branch_id
       WHERE t.tenant_id = $1 AND t.created_at >= now() - interval '30 days'${transferF.clause}
       ORDER BY t.created_at DESC LIMIT 50`,
      [actor.tenantId, ...transferF.params],
    );

    const data = {
      new_joiners: newJoiners.rows,
      probation_ending: probationEnding.rows,
      confirmed: confirmed.rows,
      resignations: resignations.rows,
      retired,
      status_changes: otherStatusChanges,
      transfers: transfers.rows,
    };
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    return { data, total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: Documents & Compliance
  // ─────────────────────────────────────────────────────────────────────────

  async getDocumentsCompliance(actor: NotificationActor, accessScope: AccessScope, filters: { branch_id?: string }) {
    const buildEmpFilters = (alias: string, startIdx: number) => {
      const params: any[] = [];
      let clause = '';
      let idx = startIdx;
      const scope = this.employeeScopeClause(actor, accessScope, alias, idx);
      clause += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx = scope.nextIdx;
      if (filters.branch_id) { clause += ` AND ${alias}.branch_id = $${idx++}`; params.push(filters.branch_id); }
      return { clause, params, nextIdx: idx };
    };

    const expiringF = buildEmpFilters('e', 2);
    const expiringDocuments = await this.db.query(
      `SELECT ed.id, ed.document_type, ed.name, ed.expires_at,
              e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, b.name AS branch_name
       FROM employee_documents ed
       JOIN employees e ON e.id = ed.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE ed.tenant_id = $1 AND ed.deleted_at IS NULL
         AND ed.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days'${expiringF.clause}
       ORDER BY ed.expires_at ASC LIMIT 50`,
      [actor.tenantId, ...expiringF.params],
    );

    const data = {
      expiring_documents: expiringDocuments.rows,
      missing_documents: [] as any[],
      contract_expiry: [] as any[],
      passport_expiry: [] as any[],
      visa_expiry: [] as any[],
      certification_expiry: [] as any[],
    };
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    return { data, total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tab: System Alerts
  // ─────────────────────────────────────────────────────────────────────────

  async getSystemAlerts(actor: NotificationActor, accessScope: AccessScope, filters: { branch_id?: string }) {
    if (actor.userType === 'employee') {
      const data = {
        biometric_devices_offline: [] as any[],
        sync_failures: [] as any[],
        branch_activation_restrictions: [] as any[],
        integration_errors: [] as any[],
        email_failures: [] as any[],
        sms_failures: [] as any[],
        queue_failures: [] as any[],
        payroll_processing_errors: [] as any[],
      };
      return { data, total: 0 };
    }

    const deviceParams: any[] = [actor.tenantId];
    let deviceIdx = 2;
    let deviceClause = '';
    const deviceScope = branchScopeClause(accessScope, 'd.branch_id', deviceIdx);
    deviceClause += ` AND ${deviceScope.clause}`;
    deviceParams.push(...deviceScope.params);
    deviceIdx += deviceScope.params.length;
    if (filters.branch_id) { deviceClause += ` AND d.branch_id = $${deviceIdx++}`; deviceParams.push(filters.branch_id); }

    const devicesOffline = await this.db.query(
      `SELECT d.id, d.name, d.provider_name, d.last_seen_at, d.branch_id, b.name AS branch_name
       FROM biometric_devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       WHERE d.tenant_id = $1 AND d.is_active = true
         AND (d.is_online = false OR d.last_seen_at < now() - interval '15 minutes')${deviceClause}
       ORDER BY d.last_seen_at ASC NULLS FIRST LIMIT 50`,
      deviceParams,
    );

    const syncFailures = await this.db.query(
      `SELECT id, provider_name, status, error_summary, started_at, completed_at
       FROM biometric_sync_logs
       WHERE tenant_id = $1 AND status = 'failed' AND started_at >= now() - interval '24 hours'
       ORDER BY started_at DESC LIMIT 50`,
      [actor.tenantId],
    );

    let branchRestrictions: any[] = [];
    if (accessScope.isGlobalAccess) {
      const { rows } = await this.db.query(
        `SELECT id, name, status, is_active
         FROM branches
         WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = false
         ORDER BY name LIMIT 50`,
        [actor.tenantId],
      );
      branchRestrictions = rows;
    }

    const data = {
      biometric_devices_offline: devicesOffline.rows,
      sync_failures: syncFailures.rows,
      branch_activation_restrictions: branchRestrictions,
      integration_errors: [] as any[],
      email_failures: [] as any[],
      sms_failures: [] as any[],
      queue_failures: [] as any[],
      payroll_processing_errors: [] as any[],
    };
    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    return { data, total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Preferences
  // ─────────────────────────────────────────────────────────────────────────

  static readonly PREFERENCE_MODULES = ['attendance', 'payroll', 'leave', 'approvals', 'documents', 'employee_events', 'system_alerts'];

  async getPreferences(actor: NotificationActor) {
    const { rows } = await this.db.query(
      `SELECT * FROM notification_preferences WHERE tenant_id = $1 AND user_id = $2`,
      [actor.tenantId, actor.sub],
    );
    const byModule = new Map(rows.map((r: any) => [r.module, r]));
    return NotificationsService.PREFERENCE_MODULES.map((module) => byModule.get(module) || {
      tenant_id: actor.tenantId,
      user_id: actor.sub,
      module,
      in_app: true,
      email: false,
      sms: false,
      whatsapp: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scheduled hooks
  // ─────────────────────────────────────────────────────────────────────────

  /** Daily sweep that warns HR/admins and the affected employee about soon-to-expire documents. */
  @Cron('13 0 7 * * *', { name: 'document-expiry-check' })
  async checkExpiringDocuments() {
    await this.schedulerControl.run('document-expiry-check', async () => {
      const { rows } = await this.db.query(
        `SELECT ed.id, ed.tenant_id, ed.document_type, ed.name, ed.expires_at,
                e.first_name || ' ' || e.last_name AS employee_name, e.branch_id, u.id AS user_id
         FROM employee_documents ed
         JOIN employees e ON e.id = ed.employee_id
         LEFT JOIN users u ON u.employee_id = e.id AND u.deleted_at IS NULL
         WHERE ed.deleted_at IS NULL
           AND (ed.expires_at - CURRENT_DATE) IN (30, 7, 1, 0)`,
      );

      for (const row of rows) {
        const daysLeft = Math.round((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000);
        const when = daysLeft <= 0 ? 'today' : `in ${daysLeft} day(s)`;
        const message = `${row.document_type || row.name} for ${row.employee_name} expires ${when} (${new Date(row.expires_at).toLocaleDateString()}).`;
        const priority = daysLeft <= 1 ? 'high' : 'medium';

        await this.emitter.emit(row.tenant_id, {
          title: 'Document Expiring',
          message,
          type: 'warning',
          priority,
          sourceModule: 'documents',
          actionUrl: '/dashboard/notifications?tab=documents-compliance',
          entityType: 'employee_document',
          entityId: row.id,
          branchId: row.branch_id || undefined,
        }).catch((err) => this.logger.warn(`Failed to emit document-expiry notification: ${err?.message}`));

        if (row.user_id) {
          await this.emitter.emit(row.tenant_id, {
            userIds: [row.user_id],
            title: 'Document Expiring',
            message,
            type: 'warning',
            priority,
            sourceModule: 'documents',
            actionUrl: '/dashboard/profile',
            entityType: 'employee_document',
            entityId: row.id,
            branchId: row.branch_id || undefined,
          }).catch((err) => this.logger.warn(`Failed to emit document-expiry notification: ${err?.message}`));
        }
      }
    });
  }

  async updatePreferences(actor: NotificationActor, module: string, channels: { in_app?: boolean; email?: boolean; sms?: boolean; whatsapp?: boolean }) {
    if (!NotificationsService.PREFERENCE_MODULES.includes(module)) {
      throw new NotFoundException(`Unknown notification module: ${module}`);
    }
    const { rows } = await this.db.query(
      `INSERT INTO notification_preferences (tenant_id, user_id, module, in_app, email, sms, whatsapp)
       VALUES ($1, $2, $3, COALESCE($4, true), COALESCE($5, false), COALESCE($6, false), COALESCE($7, false))
       ON CONFLICT (tenant_id, user_id, module)
       DO UPDATE SET in_app = COALESCE($4, notification_preferences.in_app),
                      email = COALESCE($5, notification_preferences.email),
                      sms = COALESCE($6, notification_preferences.sms),
                      whatsapp = COALESCE($7, notification_preferences.whatsapp),
                      updated_at = now()
       RETURNING *`,
      [actor.tenantId, actor.sub, module, channels.in_app, channels.email, channels.sms, channels.whatsapp],
    );
    return rows[0];
  }
}
