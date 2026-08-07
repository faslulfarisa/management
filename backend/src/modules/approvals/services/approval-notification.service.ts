import { Injectable, Optional } from '@nestjs/common';
import { ApprovalGateway } from '../gateways/approval.gateway';
import { ApprovalRequest } from '../dto/approval.dto';
import { NotificationEmitterService, NotificationPriority } from '../../notifications/services/notification-emitter.service';

const ACTION_REQUIRED_URL = '/dashboard/automation?tab=action-required';

function mapPriority(priority: ApprovalRequest['priority']): NotificationPriority {
  switch (priority) {
    case 'urgent': return 'critical';
    case 'high': return 'high';
    case 'low': return 'low';
    default: return 'medium';
  }
}

@Injectable()
export class ApprovalNotificationService {
  constructor(
    private emitter: NotificationEmitterService,
    @Optional() private gateway: ApprovalGateway,
  ) {}

  async notifyNewRequest(request: ApprovalRequest, approverUserIds: string[]) {
    const payload = {
      requestId: request.id,
      workflowType: request.workflow_type,
      title: request.title,
      branchId: request.branch_id,
      currentStep: request.current_step,
      priority: request.priority,
      dueAt: request.due_at,
    };

    if (approverUserIds.length) {
      await this.emitter.emit(request.tenant_id, {
        userIds: approverUserIds,
        title: `New approval required: ${request.title}`,
        message: `A ${request.workflow_type.replace(/_/g, ' ')} request requires your approval.`,
        type: 'approval',
        priority: mapPriority(request.priority),
        sourceModule: 'approvals',
        actionUrl: ACTION_REQUIRED_URL,
        entityType: 'approval_request',
        entityId: request.id,
        branchId: request.branch_id || undefined,
      });
    }

    for (const userId of approverUserIds) {
      this.gateway?.notifyApprover(userId, payload);
    }
  }

  async notifyStepAdvanced(request: ApprovalRequest, nextApproverUserIds: string[], submittedByUserId?: string) {
    const payload = {
      requestId: request.id,
      workflowType: request.workflow_type,
      title: request.title,
      currentStep: request.current_step,
      totalSteps: request.total_steps,
      status: request.status,
    };

    if (nextApproverUserIds.length) {
      await this.emitter.emit(request.tenant_id, {
        userIds: nextApproverUserIds,
        title: `Approval needed (step ${request.current_step}): ${request.title}`,
        message: `Approved at step ${request.current_step - 1}. Your action is required.`,
        type: 'approval',
        priority: mapPriority(request.priority),
        sourceModule: 'approvals',
        actionUrl: ACTION_REQUIRED_URL,
        entityType: 'approval_request',
        entityId: request.id,
        branchId: request.branch_id || undefined,
      });
    }

    for (const userId of nextApproverUserIds) {
      this.gateway?.notifyApprover(userId, payload);
    }

    if (submittedByUserId) {
      await this.emitter.emit(request.tenant_id, {
        userIds: [submittedByUserId],
        title: `Approval progressing: ${request.title}`,
        message: `Step ${request.current_step - 1} approved. Awaiting step ${request.current_step}.`,
        type: 'success',
        priority: 'low',
        sourceModule: 'approvals',
        actionUrl: ACTION_REQUIRED_URL,
        entityType: 'approval_request',
        entityId: request.id,
        branchId: request.branch_id || undefined,
      });
      this.gateway?.broadcastUpdate(request.tenant_id, payload, [submittedByUserId]);
    }
  }

  async notifyResolved(
    request: ApprovalRequest,
    submittedByUserId?: string,
    reason?: string,
  ) {
    const approved = request.status === 'approved';
    const msg = approved
      ? `Your ${request.workflow_type.replace(/_/g, ' ')} request has been approved.`
      : `Your ${request.workflow_type.replace(/_/g, ' ')} request was ${request.status}${reason ? `: ${reason}` : '.'}`;

    if (submittedByUserId) {
      await this.emitter.emit(request.tenant_id, {
        userIds: [submittedByUserId],
        title: `${approved ? 'Approved' : 'Rejected'}: ${request.title}`,
        message: msg,
        type: approved ? 'success' : 'error',
        priority: approved ? 'low' : 'medium',
        sourceModule: 'approvals',
        actionUrl: ACTION_REQUIRED_URL,
        entityType: 'approval_request',
        entityId: request.id,
        branchId: request.branch_id || undefined,
      });
    }

    const payload = {
      requestId: request.id,
      workflowType: request.workflow_type,
      title: request.title,
      status: request.status,
      reason,
    };
    const targets = submittedByUserId ? [submittedByUserId] : undefined;
    this.gateway?.broadcastResolved(request.tenant_id, payload, targets);
  }
}
