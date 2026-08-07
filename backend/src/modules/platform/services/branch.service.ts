import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { assertUniqueCode } from '../../../shared/unique-code.validator';
import { AccessScope, GLOBAL_ACCESS_SCOPE, branchScopeClause } from '../../../shared/scope.util';
import { BranchActivationService, BranchActivationContext } from './branch-activation.service';

@Injectable()
export class BranchService {
  constructor(
    private db: DatabaseService,
    private branchActivation: BranchActivationService,
  ) {}

  async findAll(tenantId: string, accessScope: AccessScope = GLOBAL_ACCESS_SCOPE, activationCtx?: BranchActivationContext) {
    const scope = branchScopeClause(accessScope, 'b.id', 2);
    const { rows } = await this.db.query(
      `SELECT
         b.*,
         pb.name                                                         AS parent_branch_name,
         CONCAT(mgr.first_name, ' ', mgr.last_name)                     AS manager_name,
         COUNT(DISTINCT d.id)   FILTER (WHERE d.deleted_at IS NULL)     AS department_count,
         COUNT(DISTINCT emp.id) FILTER (WHERE emp.status = 'active'
                                          AND emp.deleted_at IS NULL)   AS employee_count,
         COUNT(DISTINCT bd.id)  FILTER (WHERE bd.is_active = true)      AS device_count
       FROM branches b
       LEFT JOIN branches      pb  ON pb.id  = b.parent_branch_id
       LEFT JOIN employees     mgr ON mgr.id = b.manager_id
       LEFT JOIN departments   d   ON d.branch_id  = b.id AND d.tenant_id  = $1
       LEFT JOIN employees     emp ON emp.branch_id = b.id AND emp.tenant_id = $1
       LEFT JOIN biometric_devices bd ON bd.branch_id = b.id AND bd.tenant_id = $1
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         AND ${scope.clause}
       GROUP BY b.id, pb.name, mgr.first_name, mgr.last_name
       ORDER BY b.name ASC`,
      [tenantId, ...scope.params],
    );
    const ctx = activationCtx || await this.branchActivation.getActivationContext(tenantId);
    return rows.map(b => ({ ...b, activation_status: this.branchActivation.computeStatus(b, ctx) }));
  }

  async findOne(id: string, tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT b.*,
         pb.name                                      AS parent_branch_name,
         CONCAT(mgr.first_name, ' ', mgr.last_name)  AS manager_name,
         CONCAT(hr.first_name,  ' ', hr.last_name)   AS hr_contact_name
       FROM branches b
       LEFT JOIN branches  pb  ON pb.id  = b.parent_branch_id
       LEFT JOIN employees mgr ON mgr.id = b.manager_id
       LEFT JOIN employees hr  ON hr.id  = b.hr_contact_id
       WHERE b.id = $1 AND b.tenant_id = $2 AND b.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Branch not found');
    const ctx = await this.branchActivation.getActivationContext(tenantId);
    return { ...rows[0], activation_status: this.branchActivation.computeStatus(rows[0], ctx) };
  }

  async create(tenantId: string, data: any) {
    if (data.code) {
      await assertUniqueCode(this.db, 'branches', tenantId, 'code', data.code, { label: 'Branch code' });
    }

    // First branch ever created for a tenant is auto-activated and marked
    // as the default branch (frictionless onboarding). Beyond that, the
    // tenant's plan caps how many branches can exist at all — creation
    // itself is blocked once the limit is reached, rather than letting the
    // org create a branch it can never activate.
    const ctx = await this.branchActivation.getActivationContext(tenantId);
    const isFirstBranch = ctx.totalBranchCount === 0;

    if (!this.branchActivation.canCreateBranch(ctx)) {
      throw new ForbiddenException({
        code: 'BRANCH_CREATION_LIMIT_REACHED',
        title: 'Upgrade to add more branches',
        message:
          `Your ${ctx.planName} allows up to ${ctx.maxActiveBranches} branch${ctx.maxActiveBranches === 1 ? '' : 'es'}. ` +
          `Upgrade your subscription to create additional branches.`,
        upgradeFeatures: [
          'Create unlimited branches',
          'Activate multiple branches',
          'Manage branch-wise employees',
          'Branch-specific attendance',
          'Branch-specific payroll',
          'Multi-branch reporting',
        ],
        maxActiveBranches: ctx.maxActiveBranches,
        branchCount: ctx.totalBranchCount,
        planName: ctx.planName,
      });
    }

    const isActive = isFirstBranch || data.is_active !== false;
    const status   = data.status || 'active';

    try {
      const { rows } = await this.db.query(
        `INSERT INTO branches (
           tenant_id, name, code, display_name, branch_type,
           address, phone, email, gstin, pan, cost_center_code,
           geo_lat, geo_lng, geofence_radius_meters,
           timezone, operating_hours, established_date,
           manager_id, hr_contact_id, settings,
           status, is_active, parent_branch_id,
           is_default
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17,
           $18, $19, $20,
           $21, $22, $23,
           $24
         ) RETURNING *`,
        [
          tenantId,
          data.name,
          data.code,
          data.display_name        || null,
          data.branch_type         || 'main',
          data.address             ? JSON.stringify(data.address) : null,
          data.phone               || null,
          data.email               || null,
          data.gstin               || null,
          data.pan                 || null,
          data.cost_center_code    || null,
          data.geo_lat             || null,
          data.geo_lng             || null,
          data.geofence_radius_meters || 200,
          data.timezone            || 'Asia/Kolkata',
          data.operating_hours     ? JSON.stringify(data.operating_hours) : null,
          data.established_date    || null,
          data.manager_id          || null,
          data.hr_contact_id       || null,
          data.settings            ? JSON.stringify(data.settings) : '{}',
          status,
          isActive,
          data.parent_branch_id    || null,
          isFirstBranch,
        ],
      );
      return rows[0];
    } catch (e: any) {
      if (e.code === '23505') throw new ConflictException(`Branch code "${data.code}" already exists in this organisation`);
      throw e;
    }
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    if (data.code) {
      await assertUniqueCode(this.db, 'branches', tenantId, 'code', data.code, { excludeId: id, label: 'Branch code' });
    }
    const { rows } = await this.db.query(
      `UPDATE branches SET
         name                   = COALESCE($3,  name),
         code                   = COALESCE($4,  code),
         display_name           = COALESCE($5,  display_name),
         branch_type            = COALESCE($6,  branch_type),
         address                = COALESCE($7,  address),
         phone                  = COALESCE($8,  phone),
         email                  = COALESCE($9,  email),
         gstin                  = COALESCE($10, gstin),
         pan                    = COALESCE($11, pan),
         cost_center_code       = COALESCE($12, cost_center_code),
         geo_lat                = COALESCE($13, geo_lat),
         geo_lng                = COALESCE($14, geo_lng),
         geofence_radius_meters = COALESCE($15, geofence_radius_meters),
         timezone               = COALESCE($16, timezone),
         operating_hours        = COALESCE($17, operating_hours),
         established_date       = COALESCE($18, established_date),
         manager_id             = $19,
         hr_contact_id          = $20,
         status                 = COALESCE($21, status),
         is_active              = COALESCE($22, is_active),
         parent_branch_id       = $23,
         updated_at             = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        data.name               || null,
        data.code               || null,
        data.display_name       || null,
        data.branch_type        || null,
        data.address            ? JSON.stringify(data.address) : null,
        data.phone              || null,
        data.email              || null,
        data.gstin              || null,
        data.pan                || null,
        data.cost_center_code   || null,
        data.geo_lat            || null,
        data.geo_lng            || null,
        data.geofence_radius_meters || null,
        data.timezone           || null,
        data.operating_hours    ? JSON.stringify(data.operating_hours) : null,
        data.established_date   || null,
        data.manager_id         !== undefined ? (data.manager_id || null) : undefined,
        data.hr_contact_id      !== undefined ? (data.hr_contact_id || null) : undefined,
        data.status             || null,
        data.is_active          !== undefined ? data.is_active : null,
        data.parent_branch_id   !== undefined ? (data.parent_branch_id || null) : undefined,
      ],
    );
    return rows[0];
  }

  async deactivate(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    const { rows } = await this.db.query(
      `UPDATE branches SET is_active = false, status = 'inactive', updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    );
    return rows[0];
  }

  async hardDelete(id: string, tenantId: string) {
    const { rows: found } = await this.db.query(
      `SELECT id, is_active FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!found.length) throw new NotFoundException('Branch not found');
    if (found[0].is_active) throw new BadRequestException('Branch must be deactivated before it can be permanently deleted');
    await this.db.query(
      `DELETE FROM branches WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }
}
