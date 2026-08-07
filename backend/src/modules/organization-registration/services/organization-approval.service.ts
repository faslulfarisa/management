import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { EmailService } from '../../auth/email.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { TransitionApprovalDto } from '../dto/organization-approval.dto';

const REVIEW_STATUSES = ['pending_review', 'under_discussion', 'needs_clarification', 'approved', 'rejected'];

@Injectable()
export class OrganizationApprovalService {
  constructor(
    private db: DatabaseService,
    private emailService: EmailService,
    private auditLog: AuditLogService,
    private notificationEmitter: NotificationEmitterService,
  ) {}

  async listPending(status?: string) {
    const params: any[] = [];
    let where = 'WHERE deleted_at IS NULL';
    if (status) {
      if (!REVIEW_STATUSES.includes(status)) throw new BadRequestException('Invalid status filter');
      where += ' AND approval_status = $1';
      params.push(status);
    } else {
      where += ` AND approval_status <> 'approved'`;
    }
    const { rows } = await this.db.query(
      `SELECT id, name, legal_name, trade_name, company_type, contact_person_name, contact_person_mobile,
              contact_person_email, primary_email, phone_number, estimated_branch_count,
              estimated_employee_count, approval_status, submitted_at, reviewed_at, rejection_reason,
              demo_scheduled_at, created_at
       FROM tenants ${where}
       ORDER BY submitted_at DESC NULLS LAST, created_at DESC`,
      params,
    );
    return rows;
  }

  async getOne(tenantId: string) {
    const { rows } = await this.db.query('SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  async getStats() {
    const { rows } = await this.db.query(
      `SELECT
         count(*) FILTER (WHERE approval_status = 'pending_review' AND submitted_at > now() - interval '7 days') AS new_registrations,
         count(*) FILTER (WHERE approval_status IN ('pending_review', 'under_discussion', 'needs_clarification')) AS pending_approvals,
         count(*) FILTER (WHERE approval_status = 'pending_review') AS awaiting_contact,
         count(*) FILTER (WHERE approval_status = 'under_discussion') AS awaiting_activation,
         (SELECT count(*) FROM organization_change_requests WHERE status = 'pending') AS change_requests_pending
       FROM tenants WHERE deleted_at IS NULL`,
    );
    const r = rows[0];
    return {
      newRegistrations: parseInt(r.new_registrations, 10),
      pendingApprovals: parseInt(r.pending_approvals, 10),
      awaitingContact: parseInt(r.awaiting_contact, 10),
      awaitingActivation: parseInt(r.awaiting_activation, 10),
      changeRequestsPending: parseInt(r.change_requests_pending, 10),
    };
  }

  async transition(tenantId: string, dto: TransitionApprovalDto, actorUserId: string, ipAddress?: string, userAgent?: string) {
    const tenant = await this.getOne(tenantId);

    if (tenant.approval_status === 'approved' && dto.action !== 'schedule_demo') {
      throw new BadRequestException('Organization is already approved');
    }
    if ((dto.action === 'reject' || dto.action === 'request_info') && !dto.notes?.trim()) {
      throw new BadRequestException('Please provide a reason');
    }

    switch (dto.action) {
      case 'approve':
        return this.approve(tenant, actorUserId, ipAddress, userAgent);
      case 'reject':
        return this.reject(tenant, dto.notes!, actorUserId, ipAddress, userAgent);
      case 'request_info':
        return this.requestInfo(tenant, dto.notes!, actorUserId, ipAddress, userAgent);
      case 'under_discussion':
        return this.setStatus(tenant, 'under_discussion', 'organization_under_discussion', dto.notes, actorUserId, ipAddress, userAgent);
      case 'schedule_demo':
        return this.scheduleDemo(tenant, dto.demoAt, actorUserId, ipAddress, userAgent);
      default:
        throw new BadRequestException('Unsupported action');
    }
  }

  private async approve(tenant: any, actorUserId: string, ipAddress?: string, userAgent?: string) {
    const { rows } = await this.db.query(
      `UPDATE tenants
       SET approval_status = 'approved', status = 'active', reviewed_by = $1, reviewed_at = now(), updated_at = now()
       WHERE id = $2 RETURNING *`,
      [actorUserId, tenant.id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId: tenant.id,
      userId: actorUserId,
      entityType: 'organization',
      entityId: tenant.id,
      action: 'organization_approved',
      oldValues: { approvalStatus: tenant.approval_status, status: tenant.status },
      newValues: { approvalStatus: 'approved', status: 'active' },
      ipAddress,
      userAgent,
    });

    if (updated.organization_admin_user_id) {
      const { rows: ownerRows } = await this.db.query('SELECT email FROM users WHERE id = $1', [updated.organization_admin_user_id]);
      const ownerEmail = ownerRows[0]?.email;
      if (ownerEmail) {
        try {
          await this.emailService.sendOrganizationApprovedEmail(ownerEmail, updated);
        } catch {
          // ignore delivery failures
        }
      }
      await this.notificationEmitter.emit(tenant.id, {
        userIds: [updated.organization_admin_user_id],
        title: 'Your organization has been approved',
        message: `${updated.legal_name} is now active. You can sign in and start using the platform.`,
        type: 'success',
        priority: 'high',
        sourceModule: 'organization_registration',
        entityType: 'tenant',
        entityId: tenant.id,
      });
    }

    return updated;
  }

  private async reject(tenant: any, reason: string, actorUserId: string, ipAddress?: string, userAgent?: string) {
    const { rows } = await this.db.query(
      `UPDATE tenants
       SET approval_status = 'rejected', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [actorUserId, reason, tenant.id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId: tenant.id,
      userId: actorUserId,
      entityType: 'organization',
      entityId: tenant.id,
      action: 'organization_rejected',
      oldValues: { approvalStatus: tenant.approval_status },
      newValues: { approvalStatus: 'rejected', reason },
      ipAddress,
      userAgent,
    });

    if (updated.contact_person_email) {
      try {
        await this.emailService.sendOrganizationRejectedEmail(updated.contact_person_email, updated, reason);
      } catch {
        // ignore delivery failures
      }
    }

    return updated;
  }

  private async requestInfo(tenant: any, reason: string, actorUserId: string, ipAddress?: string, userAgent?: string) {
    return this.setStatus(tenant, 'needs_clarification', 'organization_needs_clarification', reason, actorUserId, ipAddress, userAgent, true);
  }

  private async setStatus(
    tenant: any, approvalStatus: string, action: string, notes: string | undefined,
    actorUserId: string, ipAddress?: string, userAgent?: string, emailContact = false,
  ) {
    const { rows } = await this.db.query(
      `UPDATE tenants
       SET approval_status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [approvalStatus, actorUserId, notes || null, tenant.id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId: tenant.id,
      userId: actorUserId,
      entityType: 'organization',
      entityId: tenant.id,
      action,
      oldValues: { approvalStatus: tenant.approval_status },
      newValues: { approvalStatus, notes },
      ipAddress,
      userAgent,
    });

    if (emailContact && updated.contact_person_email) {
      try {
        await this.emailService.sendOrganizationClarificationEmail(updated.contact_person_email, updated, notes || '');
      } catch {
        // ignore delivery failures
      }
    }

    return updated;
  }

  private async scheduleDemo(tenant: any, demoAt: string | undefined, actorUserId: string, ipAddress?: string, userAgent?: string) {
    if (!demoAt) throw new BadRequestException('demoAt is required to schedule a demo');
    const { rows } = await this.db.query(
      `UPDATE tenants SET demo_scheduled_at = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [demoAt, tenant.id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId: tenant.id,
      userId: actorUserId,
      entityType: 'organization',
      entityId: tenant.id,
      action: 'organization_demo_scheduled',
      newValues: { demoAt },
      ipAddress,
      userAgent,
    });

    return updated;
  }
}
