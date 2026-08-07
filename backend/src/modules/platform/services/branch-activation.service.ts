import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AuditLogService } from './audit-log.service';
import { DEFAULT_MAX_ACTIVE_BRANCHES } from '../../../shared/plan-limits.constants';
import { BillingEngineService } from '../../billing/services/billing-engine.service';

export type BranchActivationStatus = 'active' | 'inactive' | 'locked_by_plan';

export interface BranchActivationContext {
  maxActiveBranches: number | null; // null = unlimited
  activeBranchCount: number;
  totalBranchCount: number;
  planName: string;
}

interface AuditMeta {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * TEMPORARY subscription-gated branch activation.
 *
 * Enforces "max active branches" per the tenant's plan by driving
 * activation off the existing `is_active`/`status` lifecycle columns on
 * `branches` — a branch locked by the plan is genuinely inactive
 * (non-usable), the same as a manually deactivated branch.
 * `activation_status` is a computed display label ('active' / 'inactive' /
 * 'locked_by_plan') that lets the UI show the right upgrade prompt for
 * inactive branches that can't be reactivated under the current plan.
 */
@Injectable()
export class BranchActivationService {
  constructor(
    private db: DatabaseService,
    private auditLog: AuditLogService,
    private billingEngine: BillingEngineService,
  ) {}

  /** Returns the tenant's plan name and max active branches from their subscription, or the Free-plan default if unsubscribed. NULL limit = unlimited. */
  async getPlanInfo(tenantId: string): Promise<{ planName: string; maxActiveBranches: number | null }> {
    const { rows } = await this.db.query(
      `SELECT sp.name
       FROM tenant_subscriptions ts
       JOIN saas_base_plans sp ON sp.id = ts.plan_id
       WHERE ts.tenant_id = $1 AND ts.status = 'active'
       ORDER BY ts.created_at DESC LIMIT 1`,
      [tenantId],
    );
    
    if (!rows.length) return { planName: 'Free Plan', maxActiveBranches: DEFAULT_MAX_ACTIVE_BRANCHES };
    
    const limits = await this.billingEngine.getResourceLimit(tenantId, 'branches');
    let limit = limits.allocated !== null ? limits.allocated : limits.maxAllowed;
    
    return {
      planName: rows[0].name,
      maxActiveBranches: limit === null || limit === undefined ? null : Number(limit),
    };
  }

  async countActiveBranches(tenantId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) FROM branches
       WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL`,
      [tenantId],
    );
    return parseInt(rows[0].count, 10);
  }

  async countTotalBranches(tenantId: string): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) FROM branches WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    return parseInt(rows[0].count, 10);
  }

  async getActivationContext(tenantId: string): Promise<BranchActivationContext> {
    const [planInfo, activeBranchCount, totalBranchCount] = await Promise.all([
      this.getPlanInfo(tenantId),
      this.countActiveBranches(tenantId),
      this.countTotalBranches(tenantId),
    ]);
    return { ...planInfo, activeBranchCount, totalBranchCount };
  }

  computeStatus(branch: { is_active: boolean }, ctx: BranchActivationContext): BranchActivationStatus {
    if (branch.is_active) return 'active';
    if (ctx.maxActiveBranches !== null && ctx.activeBranchCount >= ctx.maxActiveBranches) return 'locked_by_plan';
    return 'inactive';
  }

  /** The first branch is always allowed (frictionless onboarding); beyond that, total branch count is capped by the plan's max-active-branches limit. NULL limit = unlimited. */
  canCreateBranch(ctx: BranchActivationContext): boolean {
    return ctx.totalBranchCount === 0 || ctx.maxActiveBranches === null || ctx.totalBranchCount < ctx.maxActiveBranches;
  }

  async activate(tenantId: string, userId: string, branchId: string, meta: AuditMeta = {}) {
    const { rows } = await this.db.query(
      `SELECT id, name, is_active FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [branchId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Branch not found');
    const branch = rows[0];
    if (branch.is_active) return branch;

    const ctx = await this.getActivationContext(tenantId);

    if (ctx.maxActiveBranches !== null && ctx.activeBranchCount >= ctx.maxActiveBranches) {
      await this.auditLog.log({
        tenantId, userId, entityType: 'branch', entityId: branchId,
        action: 'branch_limit_reached',
        newValues: { branchName: branch.name, ...ctx },
        ipAddress: meta.ipAddress, userAgent: meta.userAgent,
      });
      await this.auditLog.log({
        tenantId, userId, entityType: 'branch', entityId: branchId,
        action: 'branch_activation_blocked',
        newValues: { branchName: branch.name, ...ctx },
        ipAddress: meta.ipAddress, userAgent: meta.userAgent,
      });
      await this.auditLog.log({
        tenantId, userId, entityType: 'branch', entityId: branchId,
        action: 'upgrade_prompt_shown',
        newValues: { context: 'branch_activation', branchName: branch.name, ...ctx },
        ipAddress: meta.ipAddress, userAgent: meta.userAgent,
      });

      throw new ForbiddenException({
        code: 'BRANCH_ACTIVATION_LIMIT_REACHED',
        title: 'Unlock Multiple Branches',
        message:
          `Your current plan allows only ${ctx.maxActiveBranches} active branch${ctx.maxActiveBranches === 1 ? '' : 'es'}. ` +
          `This branch has been created successfully, but activation of additional branches requires a paid subscription.`,
        upgradeFeatures: [
          'Activate multiple branches',
          'Manage branch-wise employees',
          'Branch-specific attendance',
          'Branch-specific payroll',
          'Multi-branch reporting',
        ],
        maxActiveBranches: ctx.maxActiveBranches,
        activeBranchCount: ctx.activeBranchCount,
      });
    }

    const { rows: updated } = await this.db.query(
      `UPDATE branches SET is_active = true, status = 'active', updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [branchId, tenantId],
    );

    await this.auditLog.log({
      tenantId, userId, entityType: 'branch', entityId: branchId,
      action: 'branch_activated',
      newValues: { branchName: branch.name },
      ipAddress: meta.ipAddress, userAgent: meta.userAgent,
    });

    return updated[0];
  }

  async deactivate(tenantId: string, userId: string, branchId: string, meta: AuditMeta = {}) {
    const { rows } = await this.db.query(
      `SELECT id, name, is_active FROM branches WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [branchId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Branch not found');
    if (!rows[0].is_active) return rows[0];

    const activeBranchCount = await this.countActiveBranches(tenantId);
    if (activeBranchCount <= 1) {
      throw new BadRequestException('At least one branch must remain active');
    }

    const { rows: updated } = await this.db.query(
      `UPDATE branches SET is_active = false, status = 'inactive', updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [branchId, tenantId],
    );

    await this.auditLog.log({
      tenantId, userId, entityType: 'branch', entityId: branchId,
      action: 'branch_deactivated_plan',
      newValues: { branchName: rows[0].name },
      ipAddress: meta.ipAddress, userAgent: meta.userAgent,
    });

    return updated[0];
  }
}
