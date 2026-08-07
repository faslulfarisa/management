import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../../shared/database.service';
import { TenantService } from '../../platform/services/tenant.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { validatePasswordPolicy } from '../../../shared/credential-generator.util';
import {
  ORG_LIFECYCLE_STAGES,
  OrgLifecycleStage,
  canTransitionLifecycleStage,
  statusForLifecycleStage,
} from '../../../shared/organization-lifecycle.constants';

export interface OpsActor {
  sub: string;
}

/**
 * Wraps TenantService with the CRM-style lifecycle pipeline + audit trail the
 * Internal Operations Portal needs, instead of duplicating organization CRUD.
 * Audit entries use `tenantId = the organization's own id` (audit_logs.tenant_id
 * is NOT NULL and internal staff have none) — also the semantically correct
 * key, since these events belong to that organization's history.
 */
@Injectable()
export class OrganizationLifecycleService {
  constructor(
    private db: DatabaseService,
    private tenantService: TenantService,
    private auditLog: AuditLogService,
    private hierarchyService: UserHierarchyService,
  ) {}

  async findAll(filters: { stage?: string; search?: string; page?: number; limit?: number }) {
    const { stage, search, page = 1, limit = 20 } = filters;
    let where = 'WHERE deleted_at IS NULL';
    const params: any[] = [];
    let idx = 1;

    if (stage) {
      where += ` AND lifecycle_stage = $${idx++}`;
      params.push(stage);
    }
    if (search) {
      where += ` AND (name ILIKE $${idx} OR slug ILIKE $${idx} OR primary_email ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const offset = (page - 1) * limit;
    const dataQuery = `
      SELECT id, name, slug, logo_url, status, lifecycle_stage, approval_status,
             primary_email, phone_number, industry, created_at, updated_at
      FROM tenants ${where}
      ORDER BY updated_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
    const { rows } = await this.db.query(dataQuery, [...params, limit, offset]);

    const countQuery = `SELECT COUNT(*) FROM tenants ${where}`;
    const { rows: countRows } = await this.db.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    return this.tenantService.findOne(id);
  }

  async create(data: any, actor: OpsActor) {
    const stage: OrgLifecycleStage = ORG_LIFECYCLE_STAGES.includes(data.lifecycleStage)
      ? data.lifecycleStage
      : 'pending_review';
    const status = statusForLifecycleStage(stage);

    const tenant = await this.tenantService.create({ ...data, status }, actor.sub);

    const { rows } = await this.db.query(
      `UPDATE tenants SET lifecycle_stage = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [stage, tenant.id],
    );
    const created = rows[0];

    // If an admin email is provided, provision the admin account.
    // If the user exists, link them instead of creating a new user.
    if (data.adminEmail) {
      const email = data.adminEmail.toLowerCase().trim();
      const { rows: existingUser } = await this.db.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );
      
      let userId: string;

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
      } else {
        const passwordHash = await bcrypt.hash(data.adminPassword || 'Aa!12345678', 12);
        
        const { rows: userRows } = await this.db.query(
          `INSERT INTO users (tenant_id, email, phone, full_name, password_hash, is_registration_owner, email_verified_at, mobile_verified_at)
           VALUES ($1, $2, $3, $4, $5, true, now(), now()) RETURNING id`,
          [tenant.id, email, data.contactPersonMobile || null, data.adminFullName || null, passwordHash],
        );
        userId = userRows[0].id;
      }

      await this.db.query(
        `INSERT INTO user_tenants (user_id, tenant_id, user_type, is_org_admin) 
         VALUES ($1, $2, 'org_admin', true)
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET user_type = 'org_admin', is_org_admin = true`,
        [userId, tenant.id],
      );

      await this.db.query(
        `UPDATE tenants SET organization_admin_user_id = $1, registration_owner_user_id = $1 WHERE id = $2`,
        [userId, tenant.id],
      );
    }

    await this.auditLog.log({
      tenantId: created.id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: created.id,
      action: 'organization_created',
      newValues: { name: created.name, lifecycleStage: stage, status },
    });

    return created;
  }

  async update(id: string, data: any, actor: OpsActor) {
    const before = await this.tenantService.findOne(id);
    // Lifecycle stage / status only change via transitionStage/suspend/activate/archive.
    const { lifecycleStage, status, ...rest } = data;
    const updated = await this.tenantService.update(id, rest, false);

    await this.auditLog.log({
      tenantId: id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: id,
      action: 'organization_updated',
      oldValues: before,
      newValues: updated,
    });

    return updated;
  }

  async remove(id: string, actor: OpsActor) {
    const existing = await this.tenantService.findOne(id);
    await this.assertNoActivePaidSubscription(id, existing.name, 'delete');

    const tenant = await this.tenantService.remove(id);

    await this.auditLog.log({
      tenantId: id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: id,
      action: 'organization_deleted',
      oldValues: { name: tenant.name, lifecycleStage: tenant.lifecycle_stage },
    });

    return tenant;
  }

  async transitionStage(id: string, toStage: OrgLifecycleStage, actor: OpsActor, reason?: string) {
    return this.applyTransition(id, toStage, actor, 'organization_lifecycle_changed', reason);
  }

  async suspend(id: string, actor: OpsActor, reason?: string) {
    return this.applyTransition(id, 'suspended', actor, 'organization_suspended', reason);
  }

  async activate(id: string, actor: OpsActor, reason?: string) {
    return this.applyTransition(id, 'active', actor, 'organization_activated', reason);
  }

  async archive(id: string, actor: OpsActor, reason?: string) {
    return this.applyTransition(id, 'archived', actor, 'organization_archived', reason);
  }

  async changeOwnership(id: string, newOwnerUserId: string, actor: OpsActor) {
    await this.tenantService.findOne(id);

    const access = await this.hierarchyService.setUserAccess(
      { sub: actor.sub, isSuperAdmin: true, userType: 'super_admin' },
      newOwnerUserId,
      id,
      { userType: 'org_admin' },
    );

    await this.auditLog.log({
      tenantId: id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: id,
      action: 'organization_ownership_changed',
      newValues: { newOwnerUserId },
    });

    return access;
  }

  async getOwnershipCandidates(id: string, search?: string) {
    const tenant = await this.tenantService.findOne(id);
    const normalizedSearch = String(search ?? '').trim();
    const currentAdminId = tenant.organization_admin_user_id || '00000000-0000-0000-0000-000000000000';
    const params: any[] = [id, currentAdminId];
    let searchClause = '';

    if (normalizedSearch) {
      params.push(`%${normalizedSearch}%`);
      searchClause = `
        AND (
          u.email ILIKE $3
          OR u.username ILIKE $3
          OR u.full_name ILIKE $3
          OR e.first_name ILIKE $3
          OR e.last_name ILIKE $3
          OR e.employee_code ILIKE $3
        )`;
    }

    const { rows } = await this.db.query(
      `SELECT
         u.id,
         u.email,
         u.username,
         u.full_name,
         u.is_active,
         ut.user_type,
         ut.is_org_admin,
         e.first_name,
         e.last_name,
         e.employee_code,
         d.name AS department,
         (u.id = $2::uuid) AS is_current_admin
       FROM user_tenants ut
       JOIN users u ON u.id = ut.user_id
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ut.tenant_id = $1
         AND u.deleted_at IS NULL
         AND u.is_internal_staff = false
         AND u.is_active = true
         ${searchClause}
       ORDER BY (u.id = $2::uuid) DESC, COALESCE(NULLIF(u.full_name, ''), NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''), u.email) ASC
       LIMIT 50`,
      params,
    );

    return rows;
  }

  async getMembers(id: string) {
    await this.tenantService.findOne(id);

    const { rows } = await this.db.query(
      `SELECT
         u.id,
         u.email,
         u.phone,
         u.username,
         u.full_name,
         u.is_active,
         ut.user_type,
         ut.is_org_admin,
         ut.created_at AS membership_created_at,
         e.first_name,
         e.last_name,
         e.employee_code,
         pos.name AS position_name,
         d.name AS department,
         (u.id = t.organization_admin_user_id) AS is_current_admin
       FROM user_tenants ut
       JOIN tenants t ON t.id = ut.tenant_id
       JOIN users u ON u.id = ut.user_id
       LEFT JOIN employees e ON e.id = u.employee_id AND e.deleted_at IS NULL
       LEFT JOIN positions pos ON pos.id = e.position_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ut.tenant_id = $1
         AND t.deleted_at IS NULL
         AND u.deleted_at IS NULL
         AND COALESCE(u.is_internal_staff, false) = false
       ORDER BY
         (u.id = t.organization_admin_user_id) DESC,
         (ut.user_type = 'org_admin' OR ut.is_org_admin = true) DESC,
         COALESCE(NULLIF(u.full_name, ''), NULLIF(CONCAT_WS(' ', e.first_name, e.last_name), ''), u.email) ASC`,
      [id],
    );

    return rows;
  }

  async resetOrganizationAdminPassword(id: string, newPassword: string, actor: OpsActor) {
    const policyErrors = validatePasswordPolicy(newPassword);
    if (policyErrors.length) {
      throw new BadRequestException(`Password does not meet policy: ${policyErrors.join(', ')}`);
    }

    await this.tenantService.findOne(id);

    const { rows } = await this.db.query(
      `SELECT u.id, u.email
       FROM tenants t
       JOIN users u ON u.id = t.organization_admin_user_id
       JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = t.id
       WHERE t.id = $1
         AND t.deleted_at IS NULL
         AND u.deleted_at IS NULL
         AND u.is_internal_staff = false
         AND (ut.user_type = 'org_admin' OR ut.is_org_admin = true)
       LIMIT 1`,
      [id],
    );

    if (!rows.length) {
      throw new BadRequestException('This organization does not have an assigned organization admin');
    }

    const admin = rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.db.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = true, failed_login_count = 0, locked_until = NULL, updated_at = now()
       WHERE id = $2`,
      [passwordHash, admin.id],
    );
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [admin.id],
    );
    await this.db.query('DELETE FROM password_change_sessions WHERE user_id = $1', [admin.id]);

    await this.auditLog.log({
      tenantId: id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: id,
      action: 'organization_admin_password_reset',
      newValues: { adminUserId: admin.id, adminEmail: admin.email },
    });

    return { success: true };
  }

  async getActivity(id: string, filters: any) {
    await this.tenantService.findOne(id);
    return this.auditLog.findAll(id, filters);
  }

  /**
   * Operations Dashboard widgets. Open Support Tickets has no backing table
   * yet (no ticketing system exists) — returns null so the frontend can
   * render that one widget as "Coming soon" instead of a fake zero.
   */
  async getDashboardStats() {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*) AS total_organizations,
         COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new_registrations,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'pending_review') AS pending_review,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'pending_approval') AS pending_approval,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'onboarding') AS onboarding,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'active') AS active_customers,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'suspended') AS suspended_customers,
         COUNT(*) FILTER (WHERE lifecycle_stage = 'archived') AS archived_organizations
       FROM tenants
       WHERE deleted_at IS NULL`,
    );
    const row = rows[0];
    return {
      totalOrganizations: parseInt(row.total_organizations, 10),
      newRegistrations: parseInt(row.new_registrations, 10),
      pendingReview: parseInt(row.pending_review, 10),
      pendingApproval: parseInt(row.pending_approval, 10),
      onboarding: parseInt(row.onboarding, 10),
      activeCustomers: parseInt(row.active_customers, 10),
      suspendedCustomers: parseInt(row.suspended_customers, 10),
      archivedOrganizations: parseInt(row.archived_organizations, 10),
      openSupportTickets: null,
    };
  }

  /** Organization Analytics report: stage distribution + new-org trend. */
  async getAnalytics() {
    const { rows: stageRows } = await this.db.query(
      `SELECT lifecycle_stage, COUNT(*) AS count
       FROM tenants WHERE deleted_at IS NULL
       GROUP BY lifecycle_stage`,
    );
    const byStage = Object.fromEntries(ORG_LIFECYCLE_STAGES.map((s) => [s, 0])) as Record<OrgLifecycleStage, number>;
    for (const row of stageRows) {
      if (row.lifecycle_stage in byStage) byStage[row.lifecycle_stage as OrgLifecycleStage] = parseInt(row.count, 10);
    }

    const { rows: trendRows } = await this.db.query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
       FROM tenants
       WHERE deleted_at IS NULL AND created_at >= now() - interval '6 months'
       GROUP BY 1 ORDER BY 1`,
    );

    return {
      byStage,
      monthlyRegistrations: trendRows.map((r: any) => ({ month: r.month, count: parseInt(r.count, 10) })),
    };
  }

  /** Activity Logs report: cross-organization audit trail, newest first. */
  async getGlobalActivity(filters: any) {
    return this.auditLog.findAllByEntityType('organization', filters);
  }

  private async applyTransition(
    id: string,
    toStage: OrgLifecycleStage,
    actor: OpsActor,
    action: string,
    reason?: string,
  ) {
    if (!ORG_LIFECYCLE_STAGES.includes(toStage)) {
      throw new BadRequestException('Invalid lifecycle stage');
    }

    const tenant = await this.tenantService.findOne(id);
    const fromStage = tenant.lifecycle_stage as OrgLifecycleStage;

    if (!canTransitionLifecycleStage(fromStage, toStage)) {
      throw new BadRequestException(`Cannot move an organization from "${fromStage}" to "${toStage}"`);
    }

    if (toStage === 'suspended' || toStage === 'archived') {
      await this.assertNoActivePaidSubscription(id, tenant.name, toStage === 'suspended' ? 'suspend' : 'archive');
    }

    const status = statusForLifecycleStage(toStage);
    const { rows } = await this.db.query(
      `UPDATE tenants SET lifecycle_stage = $1, status = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [toStage, status, id],
    );
    const updated = rows[0];

    await this.auditLog.log({
      tenantId: id,
      userId: actor.sub,
      entityType: 'organization',
      entityId: id,
      action,
      oldValues: { lifecycleStage: fromStage, status: tenant.status },
      newValues: { lifecycleStage: toStage, status, reason: reason || null },
    });

    return updated;
  }

  private async assertNoActivePaidSubscription(id: string, organizationName: string, action: 'delete' | 'suspend' | 'archive') {
    const { rows } = await this.db.query(
      `SELECT COALESCE(sbp.name, sp.name, 'Upgraded') AS plan_name
       FROM tenant_subscriptions ts
       JOIN tenants t ON t.id = ts.tenant_id
       LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id
       LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
       WHERE ts.tenant_id = $1
         AND ts.status = 'active'
         AND (t.trial_ends_at IS NULL OR t.trial_ends_at <= now())
         AND LOWER(COALESCE(sbp.slug, sp.slug, '')) NOT IN ('free', 'free-plan', 'free_plan')
         AND LOWER(COALESCE(sbp.name, sp.name, '')) NOT IN ('free', 'free plan', 'free trial')
       ORDER BY ts.created_at DESC
       LIMIT 1`,
      [id],
    );

    if (!rows.length) return;

    const planName = rows[0].plan_name || 'paid';
    throw new ConflictException(
      `Heads up: ${organizationName} is currently on the ${planName} subscription. Please cancel the active subscription before you ${action} this organization.`,
    );
  }
}
