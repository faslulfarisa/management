import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../../shared/database.service';
import { SchedulerControlService } from '../../../shared/scheduler-control.service';
import { BranchApprovalChainService } from '../../platform/services/branch-approval-chain.service';
import { PayrollLockService } from '../../platform/services/payroll-lock.service';
import { ApprovalNotificationService } from './approval-notification.service';
import { AccessScope, branchScopeClause, isBranchInScope } from '../../../shared/scope.util';
import {
  SubmitApprovalDto,
  ApprovalRequest,
  ApprovalResult,
  InboxFilters,
  ApprovalLogEntry,
  ApprovalAnalytics,
} from '../dto/approval.dto';

/**
 * Maps entity_table names to column names used for status sync.
 * The engine writes status/step/log back to the entity table after each action
 * so that existing queries against leave_requests, expenses, etc. continue to work.
 */
const ENTITY_SYNC_CONFIG: Record<string, {
  statusCol: string;
  approvedStatus: string;
  rejectedStatus: string;
  approverCol?: string;
  approvedAtCol?: string;
  reasonCol?: string;
  rejectionReasonCol?: string;
  stepCol?: string;
  logCol?: string;
  lifecycleStatusCol?: string;
  lifecycleApprovedStatus?: string;
  lifecycleRejectedStatus?: string;
}> = {
  leave_requests: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  shift_override_requests: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  leave_encashment_requests: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'processed_by', approvedAtCol: 'processed_at',
    rejectionReasonCol: 'remarks',
  },
  expenses: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  reimbursements: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  attendance_corrections: {
    statusCol: 'status', approvedStatus: 'applied', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'decided_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  employee_branch_transfers: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  payroll_runs: {
    statusCol: 'status', approvedStatus: 'finalized', rejectedStatus: 'rejected',
    approverCol: 'processed_by', approvedAtCol: 'processed_at',
    reasonCol: 'approval_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  biometric_devices: {
    statusCol: 'registration_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    reasonCol: 'approval_reason',
  },
  employee_fines: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  employee_fine_appeals: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  overtime_requests: {
    statusCol: 'status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  exit_requests: {
    statusCol: 'status', approvedStatus: 'notice_period', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approval_date',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  final_settlements: {
    statusCol: 'payment_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approval_date',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  // Compliance & Document Management: drives `approval_status` (kept distinct
  // from the broader lifecycle `status` column, which ComplianceApprovalService
  // syncs from `approval_status` after each engine call).
  compliance_documents: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'remarks', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
  },
  // Vacancy Management: drives approval_status (kept distinct from the
  // broader lifecycle `status` column, which VacancyApprovalService syncs
  // from approval_status after each engine call) — same split as
  // compliance_documents above.
  vacancies: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
    lifecycleStatusCol: 'status', lifecycleApprovedStatus: 'open', lifecycleRejectedStatus: 'rejected',
  },
  // Job Description Management: same dual-status split as vacancies above.
  job_descriptions: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
    lifecycleStatusCol: 'status', lifecycleApprovedStatus: 'approved', lifecycleRejectedStatus: 'rejected',
  },
  // Offer Management (Phase 5): same dual-status split — OfferApprovalService
  // syncs the broader `status` lifecycle (draft/pending_approval/approved/...)
  // from `approval_status` after each engine call.
  offers: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
    lifecycleStatusCol: 'status', lifecycleApprovedStatus: 'approved', lifecycleRejectedStatus: 'rejected',
  },
  // Probation & Confirmation (Phase 6): same dual-status split — ProbationApprovalService
  // syncs the broader `status` lifecycle (draft/pending_approval/approved/rejected)
  // from `approval_status` after each engine call, and calls EmployeeService.confirm()
  // once fully approved.
  probation_reviews: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
    lifecycleStatusCol: 'status', lifecycleApprovedStatus: 'approved', lifecycleRejectedStatus: 'rejected',
  },
  // Workforce Planning (Phase 7): same dual-status split — WorkforcePlanApprovalService
  // syncs the broader `status` lifecycle (draft/pending_approval/approved/rejected/active)
  // from `approval_status` after each engine call.
  workforce_plans: {
    statusCol: 'approval_status', approvedStatus: 'approved', rejectedStatus: 'rejected',
    approverCol: 'approved_by', approvedAtCol: 'approved_at',
    reasonCol: 'approval_reason', rejectionReasonCol: 'rejection_reason',
    stepCol: 'approval_step', logCol: 'approval_log',
    lifecycleStatusCol: 'status', lifecycleApprovedStatus: 'active', lifecycleRejectedStatus: 'rejected',
  },
};

// Entity tables whose full approval directly mutates payroll-relevant attendance
// data (leave balance deduction, OT amount, applied attendance correction) — these
// must be blocked once the affected period is payroll_locked/payroll_processed,
// regardless of whether approval came through the domain endpoint or the
// centralized inbox, since both funnel through _doApprove().
const PAYROLL_GUARDED_TABLES = new Set(['leave_requests', 'overtime_requests', 'attendance_corrections']);

@Injectable()
export class ApprovalEngineService {
  constructor(
    private db: DatabaseService,
    private approvalChainService: BranchApprovalChainService,
    private notificationService: ApprovalNotificationService,
    private payrollLock: PayrollLockService,
    private schedulerControl: SchedulerControlService = new SchedulerControlService(),
  ) { }

  private async assertPayrollUnlockedForEntity(tenantId: string, request: ApprovalRequest): Promise<void> {
    if (!PAYROLL_GUARDED_TABLES.has(request.entity_table)) return;

    if (request.entity_table === 'leave_requests') {
      const { rows } = await this.db.query(
        `SELECT employee_id, start_date, end_date FROM leave_requests WHERE id = $1`, [request.entity_id],
      );
      if (rows[0]) await this.payrollLock.assertPeriodUnlocked(tenantId, rows[0].employee_id, rows[0].start_date, rows[0].end_date);
    } else if (request.entity_table === 'overtime_requests') {
      const { rows } = await this.db.query(
        `SELECT employee_id, ot_date FROM overtime_requests WHERE id = $1`, [request.entity_id],
      );
      if (rows[0]) await this.payrollLock.assertPeriodUnlocked(tenantId, rows[0].employee_id, rows[0].ot_date);
    } else if (request.entity_table === 'attendance_corrections') {
      const { rows } = await this.db.query(
        `SELECT ac.employee_id, ar.date FROM attendance_corrections ac
         JOIN attendance_records ar ON ar.id = ac.attendance_record_id
         WHERE ac.id = $1`, [request.entity_id],
      );
      if (rows[0]) await this.payrollLock.assertPeriodUnlocked(tenantId, rows[0].employee_id, rows[0].date);
    }
  }

  /**
   * Called by domain services immediately after entity INSERT.
   * Resolves the approval chain for the branch+workflow, creates an
   * approval_requests row, and notifies eligible step-1 approvers.
   */
  async submit(dto: SubmitApprovalDto): Promise<ApprovalRequest> {
    const chain = await this.approvalChainService.resolveChain(
      dto.tenantId, dto.branchId ?? null, dto.workflowType,
    );

    const totalSteps = chain?.steps?.length || null;
    const slaHours = chain?.auto_approve_hours ?? null;
    const dueAt = slaHours
      ? new Date(Date.now() + slaHours * 3600 * 1000).toISOString()
      : null;

    const { rows } = await this.db.query(
      `INSERT INTO approval_requests
         (tenant_id, workflow_type, entity_id, entity_table, submitted_by,
          branch_id, department_id, title, description, total_steps,
          sla_hours, due_at, metadata, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
       RETURNING *`,
      [
        dto.tenantId, dto.workflowType, dto.entityId, dto.entityTable,
        dto.submittedBy, dto.branchId ?? null, dto.departmentId ?? null,
        dto.title, dto.description ?? null, totalSteps,
        slaHours, dueAt,
        JSON.stringify(dto.metadata ?? {}),
        dto.priority ?? 'normal',
      ],
    );

    const request: ApprovalRequest = rows[0];

    // Notify eligible step-1 approvers
    const approverIds = await this.getApproverUserIds(dto.tenantId, dto.branchId ?? null, dto.workflowType, 1);
    await this.notificationService.notifyNewRequest(request, approverIds);

    return request;
  }

  /**
   * Approve by entity ID — used by domain services which have entity PK,
   * not the approval_requests.id.
   */
  async approveByEntity(
    entityId: string,
    entityTable: string,
    tenantId: string,
    approverId: string,
    reason: string,
    remarks?: string,
    ipAddress?: string,
  ): Promise<ApprovalResult> {
    this.requireReason(reason);
    const request = await this.findByEntity(entityId, entityTable, tenantId);
    return this._doApprove(request, tenantId, approverId, reason, remarks, ipAddress);
  }

  /**
   * Approve by approval_requests.id — used by the centralized controller (inbox).
   */
  async approve(
    requestId: string,
    tenantId: string,
    approverId: string,
    reason: string,
    remarks?: string,
    ipAddress?: string,
  ): Promise<ApprovalResult> {
    this.requireReason(reason);
    const request = await this.findOne(requestId, tenantId);
    return this._doApprove(request, tenantId, approverId, reason, remarks, ipAddress);
  }

  private async _doApprove(
    request: ApprovalRequest,
    tenantId: string,
    approverId: string,
    reason: string,
    remarks?: string,
    ipAddress?: string,
  ): Promise<ApprovalResult> {
    if (!['pending', 'under_review', 'escalated'].includes(request.status)) {
      throw new BadRequestException(`Cannot approve a request with status '${request.status}'`);
    }

    // Validate role eligibility (skipped for org admins / super admins)
    const actorRole = await this.getActorRole(tenantId, approverId, request.branch_id);
    await this.validateEligibility(request, actorRole, tenantId, approverId);

    const chain = await this.approvalChainService.resolveChain(
      tenantId, request.branch_id, request.workflow_type,
    );

    const { fullyApproved, nextStep, newLog } = this.approvalChainService.computeAdvance(
      request.current_step, approverId, chain, request.approval_log ?? [],
    );

    // Enrich log entry with reason and role
    const enrichedLog = [...(request.approval_log ?? [])];
    enrichedLog.push({
      step: request.current_step,
      actor_id: approverId,
      action: 'approved',
      reason,
      remarks: remarks ?? undefined,
      timestamp: new Date().toISOString(),
      role: actorRole ?? undefined,
      ip_address: ipAddress ?? undefined,
    } as ApprovalLogEntry);

    let updatedRequest: ApprovalRequest;

    if (!fullyApproved) {
      const { rows } = await this.db.query(
        `UPDATE approval_requests
         SET current_step = $2, status = 'under_review',
             approval_log = $3::jsonb, updated_at = now()
         WHERE id = $1 AND tenant_id = $4 RETURNING *`,
        [request.id, nextStep, JSON.stringify(enrichedLog), tenantId],
      );
      updatedRequest = rows[0];

      // Sync step/log to entity table (not final status)
      await this.syncEntityStep(request, nextStep, enrichedLog);

      // Notify next-step approvers and submitter
      const nextApproverIds = await this.getApproverUserIds(tenantId, request.branch_id, request.workflow_type, nextStep);
      const submitterUserId = await this.getUserIdForSubmitter(tenantId, request.submitted_by);
      await this.notificationService.notifyStepAdvanced(updatedRequest, nextApproverIds, submitterUserId ?? undefined);
    } else {
      await this.assertPayrollUnlockedForEntity(tenantId, request);

      const { rows } = await this.db.query(
        `UPDATE approval_requests
         SET status = 'approved', current_step = $2,
             approval_log = $3::jsonb, resolved_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $4 RETURNING *`,
        [request.id, request.current_step, JSON.stringify(enrichedLog), tenantId],
      );
      updatedRequest = rows[0];

      // Fetch entity for domain side-effects return value
      const entity = await this.getEntity(request.entity_table, request.entity_id, tenantId);

      // Sync final status to entity table
      await this.syncEntityStatus(request, 'approved', approverId, reason, enrichedLog, undefined);

      if (request.entity_table === 'shift_override_requests') {
        await this.generateOverridesForRequest(tenantId, request.entity_id);
      }
      if (request.entity_table === 'attendance_corrections') {
        await this.applyAttendanceCorrection(tenantId, request.entity_id, approverId);
      }
      if (request.entity_table === 'employee_branch_transfers') {
        await this.finalizeBranchTransfer(tenantId, request.entity_id, approverId);
      }
      if (request.entity_table === 'payroll_runs') {
        await this.finalizePayrollRun(tenantId, request.entity_id, approverId);
      }

      // Notify submitter of full approval
      const submitterUserId = await this.getUserIdForSubmitter(tenantId, request.submitted_by);
      await this.notificationService.notifyResolved(updatedRequest, submitterUserId ?? undefined, reason);

      return { fullyApproved: true, request: updatedRequest, entity };
    }

    const entity = await this.getEntity(request.entity_table, request.entity_id, tenantId);
    return { fullyApproved: false, request: updatedRequest, entity };
  }

  /** Reject by entity ID — used by domain services */
  async rejectByEntity(
    entityId: string,
    entityTable: string,
    tenantId: string,
    rejecterId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<ApprovalRequest> {
    this.requireReason(reason);
    const request = await this.findByEntity(entityId, entityTable, tenantId);
    return this._doReject(request, tenantId, rejecterId, reason, ipAddress);
  }

  /** Reject by approval_requests.id — used by centralized controller */
  async reject(
    requestId: string,
    tenantId: string,
    rejecterId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<ApprovalRequest> {
    this.requireReason(reason);
    const request = await this.findOne(requestId, tenantId);
    return this._doReject(request, tenantId, rejecterId, reason, ipAddress);
  }

  private async _doReject(
    request: ApprovalRequest,
    tenantId: string,
    rejecterId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<ApprovalRequest> {
    if (!['pending', 'under_review', 'escalated'].includes(request.status)) {
      throw new BadRequestException(`Cannot reject a request with status '${request.status}'`);
    }

    const actorRole = await this.getActorRole(tenantId, rejecterId, request.branch_id);
    await this.validateEligibility(request, actorRole, tenantId, rejecterId);

    const enrichedLog = [...(request.approval_log ?? []), {
      step: request.current_step,
      actor_id: rejecterId,
      action: 'rejected',
      reason,
      timestamp: new Date().toISOString(),
      role: actorRole ?? undefined,
      ip_address: ipAddress ?? undefined,
    } as ApprovalLogEntry];

    const { rows } = await this.db.query(
      `UPDATE approval_requests
       SET status = 'rejected', rejection_reason = $2,
           approval_log = $3::jsonb, resolved_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $4 RETURNING *`,
      [request.id, reason, JSON.stringify(enrichedLog), tenantId],
    );
    const updatedRequest: ApprovalRequest = rows[0];

    await this.syncEntityStatus(request, 'rejected', rejecterId, reason, enrichedLog, undefined);

    const submitterUserId = await this.getUserIdForSubmitter(tenantId, request.submitted_by);
    await this.notificationService.notifyResolved(updatedRequest, submitterUserId ?? undefined, reason);

    return updatedRequest;
  }

  /** Cancel a pending/under_review request (submitter or admin) */
  async cancel(
    requestId: string,
    tenantId: string,
    cancelledBy: string,
    reason?: string,
  ): Promise<ApprovalRequest> {
    const request = await this.findOne(requestId, tenantId);
    if (!['pending', 'under_review'].includes(request.status)) {
      throw new BadRequestException(`Cannot cancel a request with status '${request.status}'`);
    }

    const submitterUserId = await this.getUserIdForSubmitter(tenantId, request.submitted_by);
    const isSubmitter = cancelledBy === request.submitted_by || cancelledBy === submitterUserId;
    if (!isSubmitter) {
      const isAdmin = await this.isOrgAdmin(tenantId, cancelledBy);
      if (!isAdmin) {
        throw new ForbiddenException('Only the original submitter or an organization admin can cancel this request');
      }
    }

    const enrichedLog = [...(request.approval_log ?? []), {
      step: request.current_step,
      actor_id: cancelledBy,
      action: 'cancelled',
      reason: reason ?? 'Cancelled by user',
      timestamp: new Date().toISOString(),
    } as ApprovalLogEntry];

    const { rows } = await this.db.query(
      `UPDATE approval_requests
       SET status = 'cancelled', approval_log = $2::jsonb,
           resolved_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $3 RETURNING *`,
      [requestId, JSON.stringify(enrichedLog), tenantId],
    );

    await this.syncEntityStatus(request, 'cancelled', cancelledBy, reason, enrichedLog, undefined);
    return rows[0];
  }

  /** Admin escalation — skips current step */
  async escalate(
    requestId: string,
    tenantId: string,
    escalatedBy: string,
  ): Promise<ApprovalRequest> {
    const request = await this.findOne(requestId, tenantId);

    const chain = await this.approvalChainService.resolveChain(
      tenantId, request.branch_id, request.workflow_type,
    );
    const sorted = chain?.steps ? [...chain.steps].sort((a: any, b: any) => a.step - b.step) : [];
    const idx = sorted.findIndex((s: any) => s.step === request.current_step);
    const next = sorted[idx + 1];

    const enrichedLog = [...(request.approval_log ?? []), {
      step: request.current_step,
      actor_id: escalatedBy,
      action: 'escalated',
      reason: 'Escalated by administrator',
      timestamp: new Date().toISOString(),
    } as ApprovalLogEntry];

    if (!next) {
      // Already at last step — treat as approved
      const { rows } = await this.db.query(
        `UPDATE approval_requests
         SET status = 'approved', approval_log = $2::jsonb,
             resolved_at = now(), updated_at = now()
         WHERE id = $1 AND tenant_id = $3 RETURNING *`,
        [requestId, JSON.stringify(enrichedLog), tenantId],
      );
      await this.syncEntityStatus(request, 'approved', escalatedBy, 'Escalated', enrichedLog, undefined);
      if (request.entity_table === 'employee_branch_transfers') {
        await this.finalizeBranchTransfer(tenantId, request.entity_id, escalatedBy);
      }
      if (request.entity_table === 'payroll_runs') {
        await this.finalizePayrollRun(tenantId, request.entity_id, escalatedBy);
      }
      return rows[0];
    }

    const { rows } = await this.db.query(
      `UPDATE approval_requests
       SET current_step = $2, status = 'escalated',
           approval_log = $3::jsonb, updated_at = now()
       WHERE id = $1 AND tenant_id = $4 RETURNING *`,
      [requestId, next.step, JSON.stringify(enrichedLog), tenantId],
    );
    await this.syncEntityStep(request, next.step, enrichedLog);
    return rows[0];
  }

  /**
   * Inbox: pending items where the current step's required role matches
   * the caller's role in branch_user_access for that branch.
   * Org admins and super admins see all pending items for the tenant.
   */
  async getInbox(
    tenantId: string,
    userId: string,
    isSuperAdmin: boolean,
    filters: InboxFilters,
    accessScope?: AccessScope,
  ): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 20, workflowType, branchId, priority } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    if (branchId && accessScope && !isBranchInScope(accessScope, branchId)) {
      throw new ForbiddenException('Branch is outside your assigned scope');
    }

    const isOrgAdmin = await this.isOrgAdmin(tenantId, userId);
    const params: any[] = [tenantId];
    let idx = 2;

    let baseQuery: string;

    if (isSuperAdmin || isOrgAdmin || (accessScope && !accessScope.isGlobalAccess)) {
      baseQuery = `
        FROM approval_requests ar
        WHERE ar.tenant_id = $1
          AND ar.status IN ('pending','under_review','escalated')`;
      if (accessScope && !accessScope.isGlobalAccess) {
        const scope = branchScopeClause(accessScope, 'ar.branch_id', idx);
        baseQuery += ` AND ${scope.clause}`;
        params.push(...scope.params);
        idx += scope.params.length;
      }
    } else {
      baseQuery = `
        FROM approval_requests ar
        JOIN LATERAL (
          SELECT bac.steps, bac.auto_approve_hours
          FROM branch_approval_chains bac
          WHERE bac.branch_id = ar.branch_id
            AND bac.tenant_id = ar.tenant_id
            AND bac.workflow_type = ar.workflow_type
            AND bac.is_active = true
          LIMIT 1
        ) chain ON true
        JOIN LATERAL (
          SELECT s->>'role' AS required_role, s->>'approver_id' AS step_approver_id
          FROM jsonb_array_elements(chain.steps) s
          WHERE (s->>'step')::int = ar.current_step
          LIMIT 1
        ) step_info ON true
        LEFT JOIN branch_user_access bua
          ON bua.branch_id = ar.branch_id
          AND bua.user_id = $${idx} AND bua.tenant_id = $1 AND bua.is_active = true
        WHERE ar.tenant_id = $1
          AND ar.status IN ('pending','under_review','escalated')
          AND (
            step_info.step_approver_id::uuid = $${idx}
            OR (step_info.step_approver_id IS NULL AND bua.role = step_info.required_role)
          )`;
      params.push(userId); idx++;
    }

    if (workflowType) { baseQuery += ` AND ar.workflow_type = $${idx++}`; params.push(workflowType); }
    if (branchId) { baseQuery += ` AND ar.branch_id = $${idx++}`; params.push(branchId); }
    if (priority) { baseQuery += ` AND ar.priority = $${idx++}`; params.push(priority); }

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${baseQuery}`, params),
      this.db.query(
        `SELECT ar.* ${baseQuery}
         ORDER BY CASE ar.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                  ar.due_at ASC NULLS LAST, ar.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows, total };
  }

  /**
   * History: resolved items where the caller was involved, or all for admins
   */
  async getHistory(
    tenantId: string,
    userId: string,
    isSuperAdmin: boolean,
    filters: InboxFilters,
    accessScope?: AccessScope,
  ): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 20, workflowType, branchId, status, priority } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    if (branchId && accessScope && !isBranchInScope(accessScope, branchId)) {
      throw new ForbiddenException('Branch is outside your assigned scope');
    }

    const isOrgAdmin = await this.isOrgAdmin(tenantId, userId);
    const params: any[] = [tenantId];
    let idx = 2;

    let baseQuery: string;

    if (isSuperAdmin || isOrgAdmin) {
      baseQuery = `
        FROM approval_requests ar
        WHERE ar.tenant_id = $1
          AND ar.status NOT IN ('pending','under_review','escalated')`;
      if (accessScope && !accessScope.isGlobalAccess) {
        const scope = branchScopeClause(accessScope, 'ar.branch_id', idx);
        baseQuery += ` AND ${scope.clause}`;
        params.push(...scope.params);
        idx += scope.params.length;
      }
    } else {
      // For regular users, history is requests where they took an action in the approval_log.
      baseQuery = `
        FROM approval_requests ar
        WHERE ar.tenant_id = $1
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(ar.approval_log, '[]'::jsonb)) AS log
            WHERE log->>'actor_id' = $2
          )
          AND ar.status NOT IN ('pending','under_review','escalated')`;
      params.push(userId);
      idx++;
    }

    if (workflowType) { baseQuery += ` AND ar.workflow_type = $${idx++}`; params.push(workflowType); }
    if (branchId) { baseQuery += ` AND ar.branch_id = $${idx++}`; params.push(branchId); }
    if (status) { baseQuery += ` AND ar.status = $${idx++}`; params.push(status); }
    if (priority) { baseQuery += ` AND ar.priority = $${idx++}`; params.push(priority); }

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${baseQuery}`, params),
      this.db.query(
        `SELECT ar.* ${baseQuery}
         ORDER BY ar.resolved_at DESC NULLS LAST, ar.updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);

    return { data: dataResult.rows, total };
  }

  /** Requests submitted by the caller, or approved requests scoped to an admin/branch_admin */
  async getSubmitted(
    tenantId: string,
    submittedBy: string,
    isSuperAdmin: boolean,
    filters: InboxFilters,
    accessScope?: AccessScope,
  ): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 20, workflowType, status } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    const isOrgAdmin = await this.isOrgAdmin(tenantId, submittedBy);
    let query: string;
    const params: any[] = [tenantId];
    let idx = 2;

    if (isSuperAdmin || isOrgAdmin || (accessScope && !accessScope.isGlobalAccess)) {
      query = `FROM approval_requests WHERE tenant_id = $1`;
      if (accessScope && !accessScope.isGlobalAccess) {
        const scope = branchScopeClause(accessScope, 'branch_id', idx);
        query += ` AND ${scope.clause}`;
        params.push(...scope.params);
        idx += scope.params.length;
      }
      if (status) {
        query += ` AND status = $${idx++}`;
        params.push(status);
      } else {
        query += ` AND status = 'approved'`;
      }
    } else {
      query = `FROM approval_requests WHERE tenant_id = $1 AND submitted_by = $${idx++}`;
      params.push(submittedBy);
      if (status) {
        query += ` AND status = $${idx++}`;
        params.push(status);
      }
    }

    if (workflowType) { query += ` AND workflow_type = $${idx++}`; params.push(workflowType); }

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${query}`, params),
      this.db.query(
        `SELECT * ${query} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);
    const total = parseInt(countResult.rows[0].count, 10);
    return { data: dataResult.rows, total };
  }

  async findOne(requestId: string, tenantId: string, accessScope?: AccessScope): Promise<ApprovalRequest> {
    const { rows } = await this.db.query(
      `SELECT ar.*,
         u.email AS submitted_by_email,
         b.name AS branch_name
       FROM approval_requests ar
       LEFT JOIN users u ON u.id = ar.submitted_by
       LEFT JOIN branches b ON b.id = ar.branch_id
       WHERE ar.id = $1 AND ar.tenant_id = $2`,
      [requestId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Approval request not found');
    if (accessScope && !isBranchInScope(accessScope, rows[0].branch_id)) {
      throw new NotFoundException('Approval request not found');
    }
    return rows[0];
  }

  async getPendingCount(tenantId: string, userId: string, isSuperAdmin: boolean, accessScope?: AccessScope): Promise<number> {
    const result = await this.getInbox(tenantId, userId, isSuperAdmin, { page: 1, limit: 1 }, accessScope);
    return result.total;
  }

  async getAnalytics(
    tenantId: string,
    filters: { from?: string; to?: string; workflowType?: string; branchId?: string },
    accessScope?: AccessScope,
  ): Promise<ApprovalAnalytics> {
    const { from, to, workflowType, branchId } = filters;
    let where = 'WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;

    if (branchId && accessScope && !isBranchInScope(accessScope, branchId)) {
      throw new ForbiddenException('Branch is outside your assigned scope');
    }

    if (from) { where += ` AND created_at >= $${idx++}`; params.push(from); }
    if (to) { where += ` AND created_at <= $${idx++}`; params.push(to); }
    if (workflowType) { where += ` AND workflow_type = $${idx++}`; params.push(workflowType); }
    if (branchId) { where += ` AND branch_id = $${idx++}`; params.push(branchId); }
    if (!branchId && accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'branch_id', idx);
      where += ` AND ${scope.clause}`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    const [summary, byWorkflow] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
           SUM(CASE WHEN status IN ('pending','under_review') THEN 1 ELSE 0 END)::int AS pending,
           SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)::int AS expired,
           SUM(CASE WHEN due_at IS NOT NULL AND resolved_at > due_at THEN 1 ELSE 0 END)::int AS sla_breach_count,
           ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 2) AS avg_resolution_hours
         FROM approval_requests ${where}`,
        params,
      ),
      this.db.query(
        `SELECT workflow_type,
           COUNT(*)::int AS total,
           SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int AS approved,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
           ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 2) AS avg_hours
         FROM approval_requests ${where}
         GROUP BY workflow_type ORDER BY total DESC`,
        params,
      ),
    ]);

    const s = summary.rows[0];
    const total = s.total || 0;
    const rejected = s.rejected || 0;

    return {
      total,
      approved: s.approved || 0,
      rejected,
      pending: s.pending || 0,
      expired: s.expired || 0,
      rejection_rate: total > 0 ? parseFloat(((rejected / total) * 100).toFixed(2)) : 0,
      avg_resolution_hours: s.avg_resolution_hours ? parseFloat(s.avg_resolution_hours) : null,
      sla_breach_count: s.sla_breach_count || 0,
      by_workflow_type: byWorkflow.rows,
      by_step_bottleneck: [],
    };
  }

  /** Cron: mark overdue requests as expired; auto-approve if chain has auto_approve_hours */
  @Cron('23 */10 * * * *', { name: 'approval-expiry-sweep' })
  async processExpiredRequests(): Promise<void> {
    await this.schedulerControl.run('approval-expiry-sweep', async () => {
      await this.db.query(
        `UPDATE approval_requests
         SET status = 'expired', updated_at = now(), resolved_at = now()
         WHERE due_at < now()
           AND status IN ('pending', 'under_review')
           AND sla_hours IS NOT NULL`,
        [],
      );
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private requireReason(reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Approval reason must be at least 5 characters');
    }
  }

  private async findByEntity(entityId: string, entityTable: string, tenantId: string): Promise<ApprovalRequest> {
    const { rows } = await this.db.query(
      `SELECT * FROM approval_requests
       WHERE entity_id = $1 AND entity_table = $2 AND tenant_id = $3
         AND status IN ('pending','under_review','escalated')
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, entityTable, tenantId],
    );
    if (!rows.length) throw new NotFoundException('No active approval request found for this entity');
    return rows[0];
  }

  private async getActorRole(tenantId: string, userId: string, branchId: string | null): Promise<string | null> {
    if (!branchId) return null;
    const { rows } = await this.db.query(
      `SELECT role FROM branch_user_access
       WHERE tenant_id = $1 AND user_id = $2 AND branch_id = $3 AND is_active = true
       LIMIT 1`,
      [tenantId, userId, branchId],
    );
    return rows[0]?.role ?? null;
  }

  private async isOrgAdmin(tenantId: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM user_tenants WHERE tenant_id = $1 AND user_id = $2 AND is_org_admin = true LIMIT 1`,
      [tenantId, userId],
    );
    if (rows.length) return true;
    // Fallback: check user_roles for org_admin system role
    const { rows: roleRows } = await this.db.query(
      `SELECT 1 FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2
         AND r.name = 'org_admin' AND r.is_system = true
       LIMIT 1`,
      [tenantId, userId],
    );
    return roleRows.length > 0;
  }

  private async validateEligibility(
    request: ApprovalRequest,
    actorRole: string | null,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const isAdmin = await this.isOrgAdmin(tenantId, userId);
    if (isAdmin) return;

    if (!request.branch_id) {
      throw new ForbiddenException(
        'This approval request is not associated with a branch. Assign the employee or request to a branch, or ask an organization admin to act on it.',
      );
    }

    const chain = await this.approvalChainService.resolveChain(
      tenantId, request.branch_id, request.workflow_type,
    );
    // No approval chain configured for this branch+workflow: only the explicit
    // workflow fallback approvers can act. Without this, any authenticated user
    // could approve/reject an unconfigured request.
    if (!chain || !chain.steps?.length) {
      if (request.workflow_type === 'fine_appeal' && actorRole === 'branch_admin') {
        return;
      }
      throw new ForbiddenException(
        'No approval chain is configured for this branch. Only a fallback approver can act on this request.',
      );
    }

    const sorted = [...chain.steps].sort((a: any, b: any) => a.step - b.step);
    const stepDef = sorted.find((s: any) => s.step === request.current_step);
    if (!stepDef) return;

    // Steps with a named approver are restricted to that user alone (org admins
    // already passed above) — falling through to a role match here would let
    // anyone whose role happens to match also act on a step meant for one person.
    if (stepDef.approver_id) {
      if (stepDef.approver_id === userId) return;
      throw new ForbiddenException('This step is assigned to a specific approver.');
    }

    // Legacy role-pool steps: any user holding the required role in this branch may act.
    if (stepDef.role && stepDef.role !== actorRole) {
      throw new ForbiddenException(
        `This step requires role '${stepDef.role}'. Your role in this branch is '${actorRole ?? 'none'}'.`,
      );
    }
  }

  private async syncEntityStep(request: ApprovalRequest, nextStep: number, log: ApprovalLogEntry[]) {
    const cfg = ENTITY_SYNC_CONFIG[request.entity_table];
    if (!cfg?.stepCol) return;

    await this.db.query(
      `UPDATE ${request.entity_table}
       SET ${cfg.stepCol} = $2, ${cfg.logCol} = $3::jsonb, updated_at = now()
       WHERE id = $1 AND tenant_id = $4`,
      [request.entity_id, nextStep, JSON.stringify(log), request.tenant_id],
    );
  }

  private async syncEntityStatus(
    request: ApprovalRequest,
    newStatus: 'approved' | 'rejected' | 'cancelled',
    actorId?: string,
    reason?: string,
    log?: ApprovalLogEntry[],
    client?: any,
  ): Promise<void> {
    const cfg = ENTITY_SYNC_CONFIG[request.entity_table];
    if (!cfg) return;

    const dbMethod = client
      ? (q: string, p: any[]) => client.query(q, p)
      : (q: string, p: any[]) => this.db.query(q, p);

    const mappedStatus = newStatus === 'approved' ? cfg.approvedStatus
      : newStatus === 'rejected' ? cfg.rejectedStatus
        : 'cancelled';

    const setClauses: string[] = [`${cfg.statusCol} = $2`, 'updated_at = now()'];
    const vals: any[] = [request.entity_id, mappedStatus];
    let idx = 3;
    let lifecycleStatus: string | undefined;

    if (cfg.lifecycleStatusCol) {
      lifecycleStatus = newStatus === 'approved'
        ? cfg.lifecycleApprovedStatus
        : newStatus === 'rejected'
          ? cfg.lifecycleRejectedStatus
          : undefined;
      if (lifecycleStatus) {
        setClauses.push(`${cfg.lifecycleStatusCol} = $${idx++}`);
        vals.push(lifecycleStatus);
      }
    }

    if (newStatus === 'approved' && cfg.approverCol) {
      setClauses.push(`${cfg.approverCol} = $${idx++}`); vals.push(actorId ?? null);
    }
    if (newStatus === 'approved' && cfg.approvedAtCol) {
      setClauses.push(`${cfg.approvedAtCol} = now()`);
    }
    if (newStatus === 'approved' && cfg.reasonCol) {
      setClauses.push(`${cfg.reasonCol} = $${idx++}`); vals.push(reason ?? null);
    }
    if (newStatus === 'rejected' && cfg.rejectionReasonCol) {
      setClauses.push(`${cfg.rejectionReasonCol} = $${idx++}`); vals.push(reason ?? null);
    }
    if (cfg.logCol && log) {
      setClauses.push(`${cfg.logCol} = $${idx++}::jsonb`); vals.push(JSON.stringify(log));
    }

    vals.push(request.tenant_id);
    await dbMethod(
      `UPDATE ${request.entity_table} SET ${setClauses.join(', ')} WHERE id = $1 AND tenant_id = $${idx}`,
      vals,
    );

    if (request.entity_table === 'vacancies' && lifecycleStatus) {
      await dbMethod(
        `INSERT INTO vacancy_status_history (tenant_id, vacancy_id, from_status, to_status, actor_id, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [request.tenant_id, request.entity_id, 'pending_approval', lifecycleStatus, actorId ?? null, reason ?? null],
      );
    }
  }

  private async applyAttendanceCorrection(tenantId: string, correctionId: string, actorId: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT ac.*, to_jsonb(ar) AS current_state
       FROM attendance_corrections ac
       JOIN attendance_records ar ON ar.id = ac.attendance_record_id AND ar.tenant_id = ac.tenant_id
       WHERE ac.id = $1 AND ac.tenant_id = $2
       FOR UPDATE`,
      [correctionId, tenantId],
    );
    const correction = rows[0];
    if (!correction || correction.applied_at) return;

    const requested = correction.requested_state as Record<string, any>;
    const allowedFields = ['clock_in', 'clock_out', 'status', 'overtime_minutes', 'late_minutes'];
    const fieldsToApply = allowedFields.filter((field) => requested?.[field] !== undefined);

    if (fieldsToApply.length) {
      const setClauses = fieldsToApply.map((field, index) => `${field} = $${index + 3}`);
      const setValues = fieldsToApply.map((field) => requested[field]);

      await this.db.query(
        `UPDATE attendance_records
         SET ${setClauses.join(', ')}, updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [correction.attendance_record_id, tenantId, ...setValues],
      );
    }

    await this.db.query(
      `UPDATE attendance_corrections
       SET applied_at = now(), updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [correctionId, tenantId],
    );

    await this.db.query(
      `INSERT INTO attendance_audit_logs
         (tenant_id, employee_id, attendance_record_id, event_type, actor_type, actor_id,
          before_state, after_state, metadata)
       VALUES ($1, $2, $3, 'approval_granted', 'user', $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
      [
        tenantId,
        correction.employee_id,
        correction.attendance_record_id,
        actorId,
        JSON.stringify(correction.current_state ?? correction.original_state ?? {}),
        JSON.stringify(requested ?? {}),
        JSON.stringify({ correctionId }),
      ],
    );
  }

  private async finalizeBranchTransfer(tenantId: string, transferId: string, actorId: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT * FROM employee_branch_transfers
       WHERE id = $1 AND tenant_id = $2`,
      [transferId, tenantId],
    );
    const transfer = rows[0];
    if (!transfer) return;

    await this.db.query(
      `UPDATE employees
       SET branch_id = $3,
           department_id = COALESCE($4, department_id),
           updated_at = now()
       WHERE id = $2 AND tenant_id = $1`,
      [tenantId, transfer.employee_id, transfer.to_branch_id, transfer.to_department_id],
    );

    await this.db.query(
      `INSERT INTO employee_lifecycle_events
         (tenant_id, employee_id, event_type, effective_date, old_values, new_values, remarks, created_by)
       SELECT $1,$2,'branch_transfer',$3,$4::jsonb,$5::jsonb,$6,$7
       WHERE NOT EXISTS (
         SELECT 1 FROM employee_lifecycle_events
         WHERE tenant_id = $1
           AND employee_id = $2
           AND event_type = 'branch_transfer'
           AND effective_date = $3
           AND created_by = $7
       )`,
      [
        tenantId,
        transfer.employee_id,
        transfer.effective_date,
        JSON.stringify({ branch_id: transfer.from_branch_id, department_id: transfer.from_department_id }),
        JSON.stringify({ branch_id: transfer.to_branch_id, department_id: transfer.to_department_id }),
        transfer.remarks,
        actorId,
      ],
    );
  }

  private async finalizePayrollRun(tenantId: string, payrollRunId: string, actorId: string): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT * FROM payroll_runs WHERE id = $1 AND tenant_id = $2`,
      [payrollRunId, tenantId],
    );
    const run = rows[0];
    if (!run) return;

    await this.db.query(
      `UPDATE payslips
       SET status = 'processed', updated_at = now()
       WHERE payroll_run_id = $1 AND tenant_id = $2 AND status = 'draft'`,
      [payrollRunId, tenantId],
    );

    const periodStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`;
    const periodEnd = new Date(Date.UTC(run.year, run.month, 0)).toISOString().split('T')[0];
    const { rows: payslips } = await this.db.query(
      `SELECT employee_id FROM payslips WHERE payroll_run_id = $1 AND tenant_id = $2`,
      [payrollRunId, tenantId],
    );
    const employeeIds = payslips.map((p: any) => p.employee_id);
    if (!employeeIds.length) return;

    await this.db.query(
      `UPDATE payroll_attendance_summary
       SET status = 'payroll_processed',
           payroll_run_id = $1,
           payslip_count = $2,
           processed_by = $3,
           processed_at = COALESCE(processed_at, now()),
           updated_at = now()
       WHERE tenant_id = $4
         AND period_start = $5
         AND period_end = $6
         AND employee_id = ANY($7::uuid[])
         AND status IN ('approved', 'payroll_locked')`,
      [payrollRunId, employeeIds.length, actorId, tenantId, periodStart, periodEnd, employeeIds],
    );
  }

  private async getEntity(entityTable: string, entityId: string, tenantId: string): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT * FROM ${entityTable} WHERE id = $1 AND tenant_id = $2`,
      [entityId, tenantId],
    );
    return rows[0] ?? null;
  }

  /**
   * Resolve user IDs who have the required role for a given step in a branch.
   * Falls back to org admins when no branch (employee unassigned) or no active
   * approval chain is configured — otherwise the request would be created
   * with zero notified approvers and become invisible to everyone.
   */
  private async getApproverUserIds(
    tenantId: string,
    branchId: string | null,
    workflowType: string,
    step: number,
  ): Promise<string[]> {
    if (!branchId) return this.getOrgAdminUserIds(tenantId);

    const chain = await this.approvalChainService.resolveChain(tenantId, branchId, workflowType);
    if (!chain?.steps?.length) {
      if (workflowType === 'fine_appeal') {
        return this.getFineAppealFallbackApproverUserIds(tenantId, branchId);
      }
      return this.getOrgAdminUserIds(tenantId);
    }

    const sorted = [...chain.steps].sort((a: any, b: any) => a.step - b.step);
    const stepDef = sorted.find((s: any) => s.step === step);
    if (!stepDef) return this.getOrgAdminUserIds(tenantId);

    // If a specific approver is named, use them
    if (stepDef.approver_id) return [stepDef.approver_id];

    // Otherwise, find all users with the required role in this branch
    const { rows } = await this.db.query(
      `SELECT DISTINCT u.id FROM branch_user_access bua
       JOIN users u ON u.id = bua.user_id
       WHERE bua.tenant_id = $1 AND bua.branch_id = $2
         AND bua.role = $3 AND bua.is_active = true AND u.is_active = true`,
      [tenantId, branchId, stepDef.role],
    );
    return rows.map((r: any) => r.id);
  }

  private async getFineAppealFallbackApproverUserIds(tenantId: string, branchId: string): Promise<string[]> {
    const [orgAdmins, branchAdmins] = await Promise.all([
      this.getOrgAdminUserIds(tenantId),
      this.db.query(
        `SELECT DISTINCT u.id
         FROM branch_user_access bua
         JOIN users u ON u.id = bua.user_id
         WHERE bua.tenant_id = $1
           AND bua.branch_id = $2
           AND bua.role = 'branch_admin'
           AND bua.is_active = true
           AND u.is_active = true`,
        [tenantId, branchId],
      ),
    ]);
    return [...new Set([...orgAdmins, ...branchAdmins.rows.map((r: any) => r.id)])];
  }

  /** All users with org-admin standing in the tenant — the fallback approver pool. */
  private async getOrgAdminUserIds(tenantId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT DISTINCT user_id AS id FROM user_tenants WHERE tenant_id = $1 AND is_org_admin = true
       UNION
       SELECT DISTINCT ur.user_id AS id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND r.name = 'org_admin' AND r.is_system = true`,
      [tenantId],
    );
    return rows.map((r: any) => r.id);
  }

  /** Get user.id for the employee who submitted (submitted_by may be employee_id or user_id) */
  private async getUserIdForSubmitter(tenantId: string, submittedBy: string | null): Promise<string | null> {
    if (!submittedBy) return null;
    // submitted_by is stored as employee_id in some flows; resolve to user_id
    const { rows } = await this.db.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND (id = $2 OR employee_id = $2) LIMIT 1`,
      [tenantId, submittedBy],
    );
    return rows[0]?.id ?? null;
  }

  private async generateOverridesForRequest(tenantId: string, requestId: string): Promise<void> {
    const { rows } = await this.db.query(
      'SELECT * FROM shift_override_requests WHERE id = $1 AND tenant_id = $2',
      [requestId, tenantId],
    );
    const req = rows[0];
    if (!req) return;

    const startDate = new Date(req.start_date);
    const endDate = new Date(req.end_date);

    // Generate individual dates in range [start_date, end_date]
    const dates: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    for (const date of dates) {
      if (req.action_type === 'cancel_shift') {
        await this.db.query(
          `INSERT INTO shift_overrides (tenant_id, employee_id, date, override_type, request_id)
           VALUES ($1, $2, $3, 'cancelled', $4)
           ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
           SET override_type = 'cancelled', request_id = $4, updated_at = now()`,
          [tenantId, req.employee_id, date, requestId],
        );
      } else if (req.action_type === 'convert_to_leave') {
        await this.db.query(
          `INSERT INTO shift_overrides (tenant_id, employee_id, date, override_type, request_id)
           VALUES ($1, $2, $3, 'leave', $4)
           ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
           SET override_type = 'leave', request_id = $4, updated_at = now()`,
          [tenantId, req.employee_id, date, requestId],
        );
        const metadata = typeof req.metadata === 'string' ? JSON.parse(req.metadata || '{}') : (req.metadata ?? {});
        const leaveTypeId = metadata.leave_type_id || null;
        if (leaveTypeId) {
          await this.db.query(
            `INSERT INTO leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, days, status, reason, approved_by, approved_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, now())
             ON CONFLICT DO NOTHING`,
            [tenantId, req.employee_id, leaveTypeId, req.start_date, req.end_date, dates.length, 'Shift override conversion: ' + req.detailed_reason, req.approved_by || null],
          );
        }
      } else if (req.action_type === 'move_shift' || req.action_type === 'temporary_shift') {
        const shiftId = req.target_shift_id;
        if (shiftId) {
          const { rows: shRows } = await this.db.query(
            'SELECT * FROM shift_definitions WHERE id = $1 AND tenant_id = $2 AND is_active = true',
            [shiftId, tenantId],
          );
          const shift = shRows[0];
          if (shift) {
            await this.db.query(
              `INSERT INTO shift_overrides (tenant_id, employee_id, date, shift_id, start_time, end_time, break_minutes, grace_period_minutes, is_overnight, override_type, request_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
               SET shift_id = $4, start_time = $5, end_time = $6, break_minutes = $7, grace_period_minutes = $8, is_overnight = $9, override_type = $10, request_id = $11, updated_at = now()`,
              [tenantId, req.employee_id, date, shiftId, shift.start_time, shift.end_time, shift.break_minutes, shift.grace_period_minutes, !!shift.is_overnight, 'shift_change', requestId],
            );
          }
        }
      } else if (req.action_type === 'override_hours') {
        const isOvernight = req.custom_start_time && req.custom_end_time && req.custom_end_time < req.custom_start_time;
        await this.db.query(
          `INSERT INTO shift_overrides (tenant_id, employee_id, date, start_time, end_time, break_minutes, grace_period_minutes, is_overnight, override_type, request_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'custom_hours', $9)
           ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
           SET start_time = $4, end_time = $5, break_minutes = $6, grace_period_minutes = $7, is_overnight = $8, override_type = 'custom_hours', request_id = $9, updated_at = now()`,
          [tenantId, req.employee_id, date, req.custom_start_time, req.custom_end_time, req.custom_break_minutes || 0, req.custom_grace_period_minutes || 15, !!isOvernight, requestId],
        );
      } else if (req.action_type === 'assign_replacement') {
        const replacementId = req.replacement_employee_id;
        if (replacementId) {
          const origShiftId = req.current_shift_id;
          let shiftDetails: any = null;
          if (origShiftId) {
            const { rows: shRows } = await this.db.query(
              'SELECT * FROM shift_definitions WHERE id = $1 AND tenant_id = $2 AND is_active = true',
              [origShiftId, tenantId],
            );
            shiftDetails = shRows[0];
          }

          const startTime = shiftDetails?.start_time ?? '09:00:00';
          const endTime = shiftDetails?.end_time ?? '18:00:00';
          const breakMins = shiftDetails?.break_minutes ?? 60;
          const graceMins = shiftDetails?.grace_period_minutes ?? 15;
          const isOvernight = shiftDetails?.is_overnight ?? false;

          await this.db.query(
            `INSERT INTO shift_overrides (tenant_id, employee_id, date, override_type, request_id)
             VALUES ($1, $2, $3, 'replaced', $4)
             ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
             SET override_type = 'replaced', request_id = $4, updated_at = now()`,
            [tenantId, req.employee_id, date, requestId],
          );

          await this.db.query(
            `INSERT INTO shift_overrides (tenant_id, employee_id, date, shift_id, start_time, end_time, break_minutes, grace_period_minutes, is_overnight, override_type, request_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'shift_change', $10)
             ON CONFLICT (tenant_id, employee_id, date) DO UPDATE 
             SET shift_id = $4, start_time = $5, end_time = $6, break_minutes = $7, grace_period_minutes = $8, is_overnight = $9, override_type = 'shift_change', request_id = $10, updated_at = now()`,
            [tenantId, replacementId, date, origShiftId || null, startTime, endTime, breakMins, graceMins, !!isOvernight, requestId],
          );
        }
      }
    }
  }
}
