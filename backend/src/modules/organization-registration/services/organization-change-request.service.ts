import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { EmailService } from '../../auth/email.service';
import { PROTECTED_ORG_FIELDS, splitProtectedFields } from '../organization-registration.constants';
import { CreateChangeRequestDto, TransitionChangeRequestDto } from '../dto/organization-change-request.dto';
import { BillingService } from '../../billing/services/billing.service';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const ADDITIONAL_ORGANIZATION_CHANGE_KEY = 'additionalOrganization';

@Injectable()
export class OrganizationChangeRequestService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private notificationEmitter: NotificationEmitterService,
    private emailService: EmailService,
    @Inject(forwardRef(() => BillingService)) private billingService: BillingService,
  ) {}

  async create(tenantId: string, requestedByUserId: string, dto: CreateChangeRequestDto, meta: RequestMeta) {
    const { rows: tenantRows } = await this.db.query('SELECT * FROM tenants WHERE id = $1 AND deleted_at IS NULL', [tenantId]);
    if (!tenantRows.length) throw new NotFoundException('Organization not found');
    const tenant = tenantRows[0];

    if (dto.requestType === 'additional_organization') {
      return this.createAdditionalOrganizationRequest(tenant, requestedByUserId, dto, meta);
    }

    const {
      reason,
      requestType: _requestType,
      organizationName: _organizationName,
      contactName: _contactName,
      contactEmail: _contactEmail,
      contactPhone: _contactPhone,
      phoneNumber: _phoneNumber,
      estimatedBranchCount: _estimatedBranchCount,
      estimatedEmployeeCount: _estimatedEmployeeCount,
      otherDetails: _otherDetails,
      ...rest
    } = dto;
    const { protectedChanges } = splitProtectedFields(rest);
    if (!Object.keys(protectedChanges).length) {
      throw new BadRequestException('No protected fields were provided to change');
    }

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

    const internalStaffIds = await this.getInternalStaffRecipientIds();
    if (internalStaffIds.length) {
      await this.notificationEmitter.emit(tenantId, {
        userIds: internalStaffIds,
        title: 'Organization change request',
        message: `${tenant.legal_name || tenant.name} has requested a change to protected company information.`,
        type: 'approval',
        priority: 'medium',
        sourceModule: 'organization_registration',
        actionUrl: `/operations/requests`,
        entityType: 'organization_change_request',
        entityId: request.id,
      });
    }

    return request;
  }

  private async createAdditionalOrganizationRequest(tenant: any, requestedByUserId: string, dto: CreateChangeRequestDto, meta: RequestMeta) {
    const organizationName = dto.organizationName?.trim();
    if (!organizationName) {
      throw new BadRequestException('Organization name is required');
    } else if (!/^[a-zA-Z0-9\s&.-]+$/.test(organizationName)) {
      throw new BadRequestException('Organization name contains invalid characters');
    }

    const companyType = dto.companyType?.trim();
    if (!companyType) throw new BadRequestException('Company type is required');

    const registrationNumber = dto.registrationNumber?.trim();
    if (!registrationNumber) {
      throw new BadRequestException('Registration number is required');
    } else if (!/^[A-Za-z0-9-]+$/.test(registrationNumber)) {
      throw new BadRequestException('Registration number format is invalid');
    }

    const gstin = dto.gstin?.trim()?.toUpperCase();
    if (!gstin) {
      throw new BadRequestException('GST Number is required');
    } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      throw new BadRequestException('Invalid GST Number format');
    }

    const panNumber = dto.panNumber?.trim()?.toUpperCase();
    if (!panNumber) {
      throw new BadRequestException('PAN Number is required');
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
      throw new BadRequestException('Invalid PAN Number format');
    }

    const phoneNumber = dto.phoneNumber?.trim();
    if (!phoneNumber) {
      throw new BadRequestException('Organization phone is required');
    } else if (!/^\+[1-9]\d{5,14}$/.test(phoneNumber)) {
      throw new BadRequestException('Organization phone is invalid');
    }

    const contactName = dto.contactName?.trim();
    if (!contactName) {
      throw new BadRequestException('Contact name is required');
    } else if (!/^[a-zA-Z\s.\-']{2,50}$/.test(contactName)) {
      throw new BadRequestException('Contact name contains invalid characters');
    }

    const contactEmail = dto.contactEmail?.trim();
    if (!contactEmail) {
      throw new BadRequestException('Contact email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new BadRequestException('Contact email must be valid');
    }

    const contactPhone = dto.contactPhone?.trim();
    if (!contactPhone) {
      throw new BadRequestException('Contact phone is required');
    } else if (!/^\+[1-9]\d{5,14}$/.test(contactPhone)) {
      throw new BadRequestException('Contact phone is invalid');
    }

    const changes = {
      [ADDITIONAL_ORGANIZATION_CHANGE_KEY]: {
        old: null,
        new: {
          organizationName,
          contactName,
          contactEmail,
          contactPhone,
          phoneNumber,
          estimatedBranchCount: dto.estimatedBranchCount ?? null,
          estimatedEmployeeCount: dto.estimatedEmployeeCount ?? null,
          companyType,
          registrationNumber,
          gstin,
          panNumber,
          otherDetails: dto.otherDetails?.trim() || null,
        },
      },
    };

    const { rows } = await this.db.query(
      `INSERT INTO organization_change_requests (tenant_id, requested_by_user_id, changes, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenant.id, requestedByUserId, JSON.stringify(changes), dto.reason],
    );
    const request = rows[0];

    await this.auditLog.log({
      tenantId: tenant.id,
      userId: requestedByUserId,
      entityType: 'organization_change_request',
      entityId: request.id,
      action: 'additional_organization_request_created',
      newValues: { changes, reason: dto.reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const internalStaffIds = await this.getInternalStaffRecipientIds();
    if (internalStaffIds.length) {
      await this.notificationEmitter.emit(tenant.id, {
        userIds: internalStaffIds,
        title: 'Additional organization requested',
        message: `${tenant.legal_name || tenant.name} requested another organization: ${organizationName}.`,
        type: 'approval',
        priority: 'medium',
        sourceModule: 'organization_registration',
        actionUrl: `/operations/requests`,
        entityType: 'organization_change_request',
        entityId: request.id,
      });
    }

    return request;
  }

  async listForTenant(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM organization_change_requests
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async assertRequesterCanRespond(id: string, tenantId: string, userId: string) {
    const request = await this.getTenantRequest(id, tenantId);
    if (request.requested_by_user_id !== userId) {
      throw new ForbiddenException('Only the requester can respond to this request');
    }
    if (request.status !== 'documents_requested') {
      throw new BadRequestException('This request is not waiting for documents or extra information');
    }
    return request;
  }

  async respondToDocumentsRequest(
    id: string,
    tenantId: string,
    userId: string,
    body: { notes?: string; documents?: any[] },
    meta: RequestMeta,
  ) {
    const request = await this.assertRequesterCanRespond(id, tenantId, userId);
    const notes = body.notes?.trim() || '';
    const documents = Array.isArray(body.documents) ? body.documents.filter((doc) => doc?.url && doc?.fileName) : [];
    if (!notes && documents.length === 0) {
      throw new BadRequestException('Provide extra information or upload at least one document');
    }

    const supportingDocuments = this.appendSupportingResponse(request.supporting_documents, {
      notes: notes || null,
      documents,
      submittedAt: new Date().toISOString(),
      submittedByUserId: userId,
    });

    const { rows } = await this.db.query(
      `UPDATE organization_change_requests
       SET status = 'pending',
           supporting_documents = $1,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(supportingDocuments), id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId,
      userId,
      entityType: 'organization_change_request',
      entityId: id,
      action: 'change_request_followup_submitted',
      newValues: { notes, documents },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const internalStaffIds = await this.getInternalStaffRecipientIds();
    if (internalStaffIds.length) {
      const requestedOrgName = request.changes?.[ADDITIONAL_ORGANIZATION_CHANGE_KEY]?.new?.organizationName;
      await this.notificationEmitter.emit(tenantId, {
        userIds: internalStaffIds,
        title: 'Organization request response submitted',
        message: `${request.tenant_legal_name || request.tenant_name} submitted follow-up information${requestedOrgName ? ` for ${requestedOrgName}` : ''}.`,
        type: 'approval',
        priority: 'medium',
        sourceModule: 'organization_registration',
        actionUrl: '/operations/requests',
        entityType: 'organization_change_request',
        entityId: id,
      });
    }

    return updated;
  }

  async listAll(status?: string) {
    const params: any[] = [];
    let where = '';
    if (status) {
      where = 'WHERE cr.status = $1';
      params.push(status);
    }
    const { rows } = await this.db.query(
      `SELECT cr.*, t.name AS tenant_name, t.legal_name AS tenant_legal_name,
              u.email AS requested_by_email, u.full_name AS requested_by_name
       FROM organization_change_requests cr
       JOIN tenants t ON t.id = cr.tenant_id
       JOIN users u ON u.id = cr.requested_by_user_id
       ${where}
       ORDER BY cr.created_at DESC`,
      params,
    );
    return rows;
  }

  async getOne(id: string) {
    const { rows } = await this.db.query(
      `SELECT cr.*, t.name AS tenant_name, t.legal_name AS tenant_legal_name,
              u.email AS requested_by_email, u.full_name AS requested_by_name
       FROM organization_change_requests cr
       JOIN tenants t ON t.id = cr.tenant_id
       JOIN users u ON u.id = cr.requested_by_user_id
       WHERE cr.id = $1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('Change request not found');
    return rows[0];
  }

  private async getTenantRequest(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT cr.*, t.name AS tenant_name, t.legal_name AS tenant_legal_name
       FROM organization_change_requests cr
       JOIN tenants t ON t.id = cr.tenant_id
       WHERE cr.id = $1 AND cr.tenant_id = $2`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Change request not found');
    return rows[0];
  }

  private appendSupportingResponse(current: any, response: any) {
    const responses = Array.isArray(current?.responses)
      ? current.responses
      : Array.isArray(current)
        ? current
        : [];
    return { responses: [...responses, response] };
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
    if (this.isAdditionalOrganizationRequest(request)) {
      throw new BadRequestException('Create and assign the new organization before approving this request');
    }

    if (request.changes?.requestType === 'plan_upgrade') {
      const data = request.changes;
      await this.billingService.subscribe(request.tenant_id, data);
      const { rows } = await this.db.query(
        `UPDATE organization_change_requests SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = now(), updated_at = now() WHERE id = $2 RETURNING *`,
        [actorUserId, request.id],
      );
      
      const { rows: tenantRows } = await this.db.query('SELECT * FROM tenants WHERE id = $1', [request.tenant_id]);
      await this.notifyRequester(request, 'approved', tenantRows[0]);
      return { ...request, status: 'approved' };
    }

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

  async fulfillAdditionalOrganizationRequest(id: string, createdTenantId: string, actorUserId: string, meta: RequestMeta) {
    if (!createdTenantId) throw new BadRequestException('createdTenantId is required');

    const request = await this.getOne(id);
    if (!this.isAdditionalOrganizationRequest(request)) {
      throw new BadRequestException('Only additional organization requests can be fulfilled');
    }
    if (request.status !== 'pending' && request.status !== 'documents_requested') {
      throw new ForbiddenException('This change request has already been decided');
    }

    const { rows: tenantRows } = await this.db.query(
      `SELECT id, name, legal_name, organization_admin_user_id, registration_owner_user_id
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [createdTenantId],
    );
    if (!tenantRows.length) throw new NotFoundException('Created organization not found');

    const createdTenant = tenantRows[0];
    const assignedToRequester =
      createdTenant.organization_admin_user_id === request.requested_by_user_id ||
      createdTenant.registration_owner_user_id === request.requested_by_user_id;
    if (!assignedToRequester) {
      const { rows: memberRows } = await this.db.query(
        `SELECT 1
         FROM user_tenants
         WHERE user_id = $1
           AND tenant_id = $2
           AND (user_type = 'org_admin' OR is_org_admin = true)
         LIMIT 1`,
        [request.requested_by_user_id, createdTenantId],
      );
      if (!memberRows.length) {
        throw new BadRequestException('Created organization must be assigned to the requesting user before fulfillment');
      }
    }

    const { rows } = await this.db.query(
      `UPDATE organization_change_requests
       SET status = 'approved',
           fulfilled_tenant_id = $1,
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [createdTenantId, actorUserId, request.id],
    );
    const fulfilled = {
      ...rows[0],
      tenant_name: request.tenant_name,
      tenant_legal_name: request.tenant_legal_name,
      requested_by_email: request.requested_by_email,
      requested_by_name: request.requested_by_name,
    };

    await this.auditLog.log({
      tenantId: request.tenant_id,
      userId: actorUserId,
      entityType: 'organization_change_request',
      entityId: request.id,
      action: 'additional_organization_request_fulfilled',
      newValues: { changes: request.changes, fulfilledTenantId: createdTenantId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.notifyRequester(fulfilled, 'approved', createdTenant);

    return fulfilled;
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
    const additionalOrganization = this.isAdditionalOrganizationRequest(request);
    const requestLabel = additionalOrganization ? 'additional organization request' : 'change request';
    const requestedOrgName = request.changes?.[ADDITIONAL_ORGANIZATION_CHANGE_KEY]?.new?.organizationName;
    const statusLabel = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'needs documents or more information';
    const additionalMessage = status === 'approved'
      ? `${tenant?.legal_name || tenant?.name || requestedOrgName || 'Your new organization'} has been created and assigned to your account.`
      : status === 'rejected'
        ? `Your request for ${requestedOrgName || 'another organization'} was rejected.${notes ? ` Notes: ${notes}` : ''}`
        : `Internal staff requested documents or more information for ${requestedOrgName || 'your organization request'}.${notes ? ` Notes: ${notes}` : ''}`;
    await this.notificationEmitter.emit(request.tenant_id, {
      userIds: [request.requested_by_user_id],
      title: `${additionalOrganization ? 'Additional organization request' : 'Change request'} ${statusLabel}`,
      message: status === 'approved'
        ? additionalOrganization
          ? additionalMessage
          : 'Your requested changes have been applied.'
        : additionalOrganization
          ? additionalMessage
          : (notes || 'Internal staff has updated your request.'),
      type: status === 'approved' ? 'success' : 'info',
      priority: 'medium',
      sourceModule: 'organization_registration',
      actionUrl: '/dashboard/system/settings/saas-billing',
      entityType: 'organization_change_request',
      entityId: request.id,
    });

    const { rows } = await this.db.query('SELECT email FROM users WHERE id = $1', [request.requested_by_user_id]);
    const email = rows[0]?.email;
    if (!email) return;
    try {
      await this.emailService.sendChangeRequestDecisionEmail(email, status, notes, requestLabel);
    } catch {
      // ignore delivery failures
    }
  }

  private isAdditionalOrganizationRequest(request: any) {
    return !!request.changes?.[ADDITIONAL_ORGANIZATION_CHANGE_KEY];
  }

  private async getInternalStaffRecipientIds() {
    const { rows } = await this.db.query(
      `SELECT id
       FROM users
       WHERE is_internal_staff = true
         AND deleted_at IS NULL
         AND is_active = true`,
    );
    return rows.map((user: any) => user.id);
  }
}
