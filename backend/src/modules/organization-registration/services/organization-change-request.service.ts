import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { EmailService } from '../../auth/email.service';
import { PROTECTED_ORG_FIELDS, splitProtectedFields } from '../organization-registration.constants';
import { CreateChangeRequestDto, TransitionChangeRequestDto } from '../dto/organization-change-request.dto';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class OrganizationChangeRequestService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private notificationEmitter: NotificationEmitterService,
    private emailService: EmailService,
  ) {}

  async create(tenantId: string, requestedByUserId: string, dto: CreateChangeRequestDto, meta: RequestMeta) {
    const { reason, ...rest } = dto;
    const { protectedChanges } = splitProtectedFields(rest);
    if (!Object.keys(protectedChanges).length) {
      throw new BadRequestException('No protected fields were provided to change');
    }

    const { rows: tenantRows } = await this.db.query('SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!tenantRows.length) throw new NotFoundException('Organization not found');
    const tenant = tenantRows[0];

    const changes: Record<string, { old: any; new: any }> = {};
    for (const [key, value] of Object.entries(protectedChanges)) {
      const column = PROTECTED_ORG_FIELDS[key];
      changes[key] = { old: tenant[column], new: value };
    }

    const { rows } = await this.db.query(
      `INSERT INTO organization_change_requests (tenant_id, requested_by_user_id, changes, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, requestedByUserId, JSON.stringify(changes), reason],
    );
    const request = rows[0];

    await this.auditLog.log({
      tenantId,
      userId: requestedByUserId,
      entityType: 'organization_change_request',
      entityId: request.id,
      action: 'change_request_created',
      newValues: { changes, reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const { rows: admins } = await this.db.query(
      `SELECT id, email FROM users WHERE is_super_admin = true AND deleted_at IS NULL AND is_active = true`,
    );
    if (admins.length) {
      await this.notificationEmitter.emit(tenantId, {
        userIds: admins.map((a: any) => a.id),
        title: 'Organization change request',
        message: `${tenant.legal_name || tenant.name} has requested a change to protected company information.`,
        type: 'approval',
        priority: 'medium',
        sourceModule: 'organization_registration',
        actionUrl: `/dashboard/platform/organization-change-requests/${request.id}`,
        entityType: 'organization_change_request',
        entityId: request.id,
      });
    }

    return request;
  }

  async listForTenant(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM organization_change_requests WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async listAll(status?: string) {
    const params: any[] = [];
    let where = '';
    if (status) {
      where = 'WHERE cr.status = $1';
      params.push(status);
    }
    const { rows } = await this.db.query(
      `SELECT cr.*, t.name AS tenant_name, t.legal_name AS tenant_legal_name
       FROM organization_change_requests cr
       JOIN tenants t ON t.id = cr.tenant_id
       ${where}
       ORDER BY cr.created_at DESC`,
      params,
    );
    return rows;
  }

  async getOne(id: string) {
    const { rows } = await this.db.query(
      `SELECT cr.*, t.name AS tenant_name, t.legal_name AS tenant_legal_name
       FROM organization_change_requests cr JOIN tenants t ON t.id = cr.tenant_id
       WHERE cr.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Change request not found');
    return rows[0];
  }

  async transition(id: string, dto: TransitionChangeRequestDto, actorUserId: string, meta: RequestMeta) {
    const request = await this.getOne(id);
    if (request.status !== 'pending' && request.status !== 'documents_requested') {
      throw new ForbiddenException('This change request has already been decided');
    }

    if (dto.action === 'approve') return this.approve(request, actorUserId, meta);
    if (dto.action === 'reject') return this.decide(request, 'rejected', dto.notes, actorUserId, meta);
    return this.decide(request, 'documents_requested', dto.notes, actorUserId, meta);
  }

  private async approve(request: any, actorUserId: string, meta: RequestMeta) {
    const changes: Record<string, { old: any; new: any }> = request.changes;

    // Re-check duplicate-prevention for identity fields, in case another org
    // has since taken the same GST/registration number.
    for (const key of ['gstin', 'registrationNumber'] as const) {
      const entry = changes[key];
      if (!entry?.new) continue;
      const column = PROTECTED_ORG_FIELDS[key];
      const { rows } = await this.db.query(
        `SELECT 1 FROM tenants WHERE ${column} = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
        [entry.new, request.tenant_id],
      );
      if (rows.length) {
        throw new ConflictException(`Another organization already uses this ${key === 'gstin' ? 'GST number' : 'registration number'}.`);
      }
    }

    const setClauses: string[] = [];
    const values: any[] = [request.tenant_id];
    let idx = 2;
    for (const [key, entry] of Object.entries(changes)) {
      const column = PROTECTED_ORG_FIELDS[key];
      if (!column) continue;
      setClauses.push(`${column} = $${idx++}`);
      values.push((entry as any).new);
    }

    const { rows } = await this.db.query(
      `UPDATE tenants SET ${setClauses.join(', ')}, profile_updated_at = now(), profile_updated_by = $${idx}, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [...values, actorUserId],
    );
    const tenant = rows[0];

    await this.db.query(
      `UPDATE organization_change_requests SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = now(), updated_at = now() WHERE id = $2`,
      [actorUserId, request.id],
    );

    await this.auditLog.log({
      tenantId: request.tenant_id,
      userId: actorUserId,
      entityType: 'organization_change_request',
      entityId: request.id,
      action: 'change_request_approved',
      oldValues: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, (v as any).old])),
      newValues: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, (v as any).new])),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.notifyRequester(request, 'approved', tenant);

    return { ...request, status: 'approved' };
  }

  private async decide(request: any, status: 'rejected' | 'documents_requested', notes: string | undefined, actorUserId: string, meta: RequestMeta) {
    await this.db.query(
      `UPDATE organization_change_requests SET status = $1, reviewed_by_user_id = $2, reviewed_at = now(), review_notes = $3, updated_at = now() WHERE id = $4`,
      [status, actorUserId, notes || null, request.id],
    );

    await this.auditLog.log({
      tenantId: request.tenant_id,
      userId: actorUserId,
      entityType: 'organization_change_request',
      entityId: request.id,
      action: status === 'rejected' ? 'change_request_rejected' : 'change_request_documents_requested',
      newValues: { notes },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.notifyRequester(request, status, null, notes);

    return { ...request, status };
  }

  private async notifyRequester(request: any, status: string, tenant: any | null, notes?: string) {
    await this.notificationEmitter.emit(request.tenant_id, {
      userIds: [request.requested_by_user_id],
      title: `Change request ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'needs documents'}`,
      message: status === 'approved'
        ? 'Your requested changes have been applied.'
        : (notes || 'A super admin has updated your change request.'),
      type: status === 'approved' ? 'success' : 'info',
      priority: 'medium',
      sourceModule: 'organization_registration',
      entityType: 'organization_change_request',
      entityId: request.id,
    });

    const { rows } = await this.db.query('SELECT email FROM users WHERE id = $1', [request.requested_by_user_id]);
    const email = rows[0]?.email;
    if (!email) return;
    try {
      await this.emailService.sendChangeRequestDecisionEmail(email, status, notes);
    } catch {
      // ignore delivery failures
    }
  }
}
