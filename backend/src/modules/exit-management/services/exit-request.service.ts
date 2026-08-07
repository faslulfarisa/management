import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause, isBranchInScope } from '../../../shared/scope.util';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { ExitTimelineService } from './exit-timeline.service';
import { ExitChecklistService } from './exit-checklist.service';
import { ExitClearanceService } from './exit-clearance.service';
import { AssetAssignmentService } from '../../assets/services/asset-assignment.service';
import { calculateLastWorkingDate, calculateNoticePeriodWindow, toDateOnlyString } from '../utils/notice-period.util';

const REQUEST_TYPES = ['resignation', 'retirement', 'termination', 'contract_completion', 'mutual_separation', 'absconding'];
const DEFAULT_NOTICE_PERIOD_DAYS = 30;

@Injectable()
export class ExitRequestService {
  constructor(
    private readonly db: DatabaseService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly timeline: ExitTimelineService,
    private readonly checklist: ExitChecklistService,
    private readonly clearance: ExitClearanceService,
    private readonly assetAssignment: AssetAssignmentService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getStats(tenantId: string, accessScope?: AccessScope) {
    const { clause, params } = accessScope ? branchScopeClause(accessScope, 'branch_id', 2) : { clause: 'true', params: [] };
    const counts = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_requests,
         COUNT(*) FILTER (WHERE status = 'notice_period') AS notice_period,
         COUNT(*) FILTER (WHERE status = 'clearance_in_progress') AS clearances_pending,
         COUNT(*) FILTER (WHERE status = 'pending_settlement') AS fnf_pending,
         COUNT(*) FILTER (WHERE status = 'settled') AS settled,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed
       FROM exit_requests WHERE tenant_id = $1 AND ${clause}`,
      [tenantId, ...params],
    );
    return {
      pending_requests: parseInt(counts.rows[0].pending_requests, 10),
      notice_period: parseInt(counts.rows[0].notice_period, 10),
      clearances_pending: parseInt(counts.rows[0].clearances_pending, 10),
      fnf_pending: parseInt(counts.rows[0].fnf_pending, 10),
      settled: parseInt(counts.rows[0].settled, 10),
      completed: parseInt(counts.rows[0].completed, 10),
    };
  }

  async list(tenantId: string, filters: { status?: string; employee_id?: string; branch_id?: string; search?: string }, accessScope?: AccessScope) {
    const params: any[] = [tenantId];
    let where = 'er.tenant_id = $1';
    let idx = 2;

    if (filters.status) { where += ` AND er.status = $${idx++}`; params.push(filters.status); }
    if (filters.employee_id) { where += ` AND er.employee_id = $${idx++}`; params.push(filters.employee_id); }
    if (filters.branch_id) { where += ` AND er.branch_id = $${idx++}`; params.push(filters.branch_id); }
    if (filters.search) {
      where += ` AND (e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.employee_code ILIKE $${idx})`;
      params.push(`%${filters.search}%`); idx++;
    }
    if (accessScope) {
      const scope = branchScopeClause(accessScope, 'er.branch_id', idx);
      where += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    const { rows } = await this.db.query(
      `SELECT er.*, e.first_name, e.last_name, e.employee_code, e.branch_id AS employee_branch_id,
              u.email AS approved_by_email
       FROM exit_requests er
       JOIN employees e ON er.employee_id = e.id
       LEFT JOIN users u ON er.approved_by = u.id
       WHERE ${where}
       ORDER BY er.created_at DESC`,
      params,
    );
    return rows;
  }

  async getById(tenantId: string, id: string, accessScope?: AccessScope) {
    const { rows } = await this.db.query(
      `SELECT er.*, e.first_name, e.last_name, e.employee_code, e.branch_id AS employee_branch_id,
              e.date_of_joining, e.department_id AS employee_department_id
       FROM exit_requests er
       JOIN employees e ON er.employee_id = e.id
       WHERE er.id = $1 AND er.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Exit request not found');
    if (accessScope && !isBranchInScope(accessScope, rows[0].branch_id)) {
      throw new NotFoundException('Exit request not found');
    }
    return rows[0];
  }

  async getMyActiveRequest(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM exit_requests
       WHERE tenant_id = $1 AND employee_id = $2 AND status NOT IN ('rejected', 'withdrawn', 'cancelled')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, employeeId],
    );
    return rows[0] ?? null;
  }

  async submit(
    tenantId: string,
    employeeId: string,
    data: {
      request_type: string;
      reason: string;
      detailed_comments?: string;
      notice_period_days?: number;
      requested_date: string;
      last_working_date?: string;
      attachment_url?: string;
    },
    actorUserId: string,
    source: 'self_service' | 'hr_admin' = 'self_service',
  ) {
    const requestType = data.request_type || 'resignation';
    if (!REQUEST_TYPES.includes(requestType)) {
      throw new BadRequestException(`Invalid resignation type. Must be one of: ${REQUEST_TYPES.join(', ')}`);
    }
    if (requestType === 'absconding' && source !== 'hr_admin') {
      throw new ForbiddenException('Absconding can only be recorded by HR');
    }

    const existing = await this.getMyActiveRequest(tenantId, employeeId);
    if (existing) {
      throw new BadRequestException('An active exit request already exists for this employee');
    }

    const { rows: empRows } = await this.db.query(
      'SELECT branch_id, department_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId],
    );
    if (!empRows.length) throw new NotFoundException('Employee not found');
    const { branch_id: branchId, department_id: departmentId } = empRows[0];

    const noticePeriodDays = data.notice_period_days ?? DEFAULT_NOTICE_PERIOD_DAYS;
    const lastWorkingDate = data.last_working_date
      || calculateLastWorkingDate(data.requested_date, noticePeriodDays);
    const { noticeStartDate, noticeEndDate } = calculateNoticePeriodWindow(data.requested_date, lastWorkingDate);

    const { rows } = await this.db.query(
      `INSERT INTO exit_requests
         (tenant_id, employee_id, request_type, reason, notice_period_days, requested_date,
          last_working_date, status, branch_id, department_id, submitted_by, source,
          notice_start_date, notice_end_date, attachment_url, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_approval',$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tenantId, employeeId, requestType, data.reason, noticePeriodDays, data.requested_date,
        lastWorkingDate, branchId, departmentId, actorUserId, source,
        noticeStartDate, noticeEndDate, data.attachment_url ?? null, data.detailed_comments ?? null,
      ],
    );
    const exitRequest = rows[0];

    await this.approvalEngine.submit({
      tenantId,
      workflowType: 'exit_request',
      entityId: exitRequest.id,
      entityTable: 'exit_requests',
      submittedBy: actorUserId,
      branchId,
      departmentId,
      title: `${this.label(requestType)} request — last working day ${lastWorkingDate}`,
      description: data.reason,
      metadata: { employee_id: employeeId, request_type: requestType, notice_period_days: noticePeriodDays },
    });

    await this.timeline.record(tenantId, exitRequest.id, 'submitted', actorUserId, data.reason);
    await this.auditLog.log({
      tenantId, userId: actorUserId, entityType: 'exit_request', entityId: exitRequest.id,
      action: 'exit_request_submitted', newValues: { request_type: requestType, last_working_date: lastWorkingDate },
    });

    return exitRequest;
  }

  /** Admin-override approve (bypasses the configured chain) — domain mutation reuses approveByEntity. */
  async approve(tenantId: string, id: string, approverId: string, reason: string, ip?: string) {
    const exitRequest = await this.getById(tenantId, id);
    const result = await this.approvalEngine.approveByEntity(id, 'exit_requests', tenantId, approverId, reason, undefined, ip);

    if (result.fullyApproved) {
      await this.timeline.record(tenantId, id, 'org_admin_approved', approverId, reason);
      await this.timeline.record(tenantId, id, 'notice_period_started', approverId);
      await this.checklist.applyTemplate(tenantId, id, exitRequest.employee_id);
      await this.clearance.applyDefaultDepartments(tenantId, id);
      await this.assetAssignment.initiateRecovery(tenantId, id, exitRequest.employee_id);

      await this.notificationEmitter.emit(tenantId, {
        userIds: await this.resolveNotifyUserIds(tenantId, exitRequest.employee_id),
        title: 'Exit request approved',
        message: `Your exit request has been approved. Notice period runs until ${toDateOnlyString(exitRequest.last_working_date)}.`,
        type: 'success', sourceModule: 'exit_management',
        entityType: 'exit_request', entityId: id, branchId: exitRequest.branch_id,
      });
    } else {
      await this.timeline.record(tenantId, id, this.stepStageLabel(result.request.current_step), approverId, reason);
    }
    return result;
  }

  async reject(tenantId: string, id: string, rejecterId: string, reason: string, ip?: string) {
    const exitRequest = await this.getById(tenantId, id);
    const result = await this.approvalEngine.rejectByEntity(id, 'exit_requests', tenantId, rejecterId, reason, ip);
    await this.timeline.record(tenantId, id, 'rejected', rejecterId, reason);
    await this.auditLog.log({
      tenantId, userId: rejecterId, entityType: 'exit_request', entityId: id,
      action: 'exit_request_rejected', newValues: { reason },
    });
    await this.notificationEmitter.emit(tenantId, {
      userIds: await this.resolveNotifyUserIds(tenantId, exitRequest.employee_id),
      title: 'Exit request rejected',
      message: reason,
      type: 'warning', sourceModule: 'exit_management',
      entityType: 'exit_request', entityId: id, branchId: exitRequest.branch_id,
    });
    return result;
  }

  /** Employee-initiated withdrawal — only while still awaiting approval. */
  async withdraw(tenantId: string, id: string, employeeId: string, reason: string) {
    const exitRequest = await this.getById(tenantId, id);
    if (exitRequest.employee_id !== employeeId) {
      throw new ForbiddenException('You can only withdraw your own exit request');
    }
    if (exitRequest.status !== 'pending_approval') {
      throw new BadRequestException(`Cannot withdraw a request with status '${exitRequest.status}'`);
    }

    const { rows: pendingApproval } = await this.db.query(
      `SELECT id FROM approval_requests
       WHERE entity_id = $1 AND entity_table = 'exit_requests' AND tenant_id = $2
         AND status IN ('pending', 'under_review', 'escalated')
       ORDER BY created_at DESC LIMIT 1`,
      [id, tenantId],
    );
    if (pendingApproval.length) {
      await this.approvalEngine.cancel(pendingApproval[0].id, tenantId, employeeId, reason);
    }

    const { rows } = await this.db.query(
      `UPDATE exit_requests SET status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [reason, id],
    );
    await this.timeline.record(tenantId, id, 'withdrawn', employeeId, reason);
    await this.auditLog.log({
      tenantId, userId: employeeId, entityType: 'exit_request', entityId: id,
      action: 'exit_request_withdrawn', newValues: { reason },
    });
    return rows[0];
  }

  async delete(tenantId: string, id: string) {
    const { rows } = await this.db.query(
      `DELETE FROM exit_requests WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'rejected', 'withdrawn', 'cancelled') RETURNING id`,
      [id, tenantId],
    );
    if (!rows.length) throw new BadRequestException('Only draft, rejected, or withdrawn exit requests can be deleted');
    return { id };
  }

  async getTimeline(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    return this.timeline.getTimeline(tenantId, id);
  }

  /** Called by FinalSettlementService once settlement is fully approved and the orchestrator has run. */
  async markCompleted(tenantId: string, id: string) {
    const { rows } = await this.db.query(
      `UPDATE exit_requests SET status = 'completed', completed_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    return rows[0];
  }

  async markClearanceInProgress(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE exit_requests SET status = 'clearance_in_progress', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'notice_period'`,
      [id, tenantId],
    );
  }

  async markPendingSettlement(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE exit_requests SET status = 'pending_settlement', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }

  async markSettled(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE exit_requests SET status = 'settled', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }

  async markAttendanceFrozen(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE exit_requests SET attendance_frozen_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }

  async markAccountDeactivated(tenantId: string, id: string) {
    await this.db.query(
      `UPDATE exit_requests SET account_deactivated_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }

  private async resolveNotifyUserIds(tenantId: string, employeeId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2
       UNION
       SELECT u.id FROM users u
       JOIN employees e ON e.reporting_manager_id IS NOT NULL AND u.employee_id = e.reporting_manager_id
       WHERE e.id = $2 AND e.tenant_id = $1`,
      [tenantId, employeeId],
    );
    return rows.map((r: any) => r.id);
  }

  private stepStageLabel(step: number): 'manager_approved' | 'hr_approved' {
    return step <= 2 ? 'manager_approved' : 'hr_approved';
  }

  private label(requestType: string): string {
    return requestType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
