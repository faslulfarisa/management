import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BranchService } from '../services/branch.service';
import { BranchAccessService } from '../services/branch-access.service';
import { UserHierarchyService } from '../services/user-hierarchy.service';
import { BranchActivationService } from '../services/branch-activation.service';

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('branches')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    private readonly branchAccessService: BranchAccessService,
    private readonly userHierarchyService: UserHierarchyService,
    private readonly branchActivationService: BranchActivationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List branches with department, employee, and device counts' })
  async findAll(@Req() req: Request, @Query('organizationId') organizationId?: string) {
    const user = (req as any).user;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, targetTenantId);
    const activationCtx = await this.branchActivationService.getActivationContext(targetTenantId);
    const data = await this.branchService.findAll(targetTenantId, accessScope, activationCtx);
    return {
      success: true,
      data,
      meta: {
        max_active_branches: activationCtx.maxActiveBranches,
        active_branch_count: activationCtx.activeBranchCount,
        total_branch_count: activationCtx.totalBranchCount,
        plan_name: activationCtx.planName,
        can_create_branch: this.branchActivationService.canCreateBranch(activationCtx),
      },
      error: null,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create branch' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const branch = await this.branchService.create(user.tenantId, data);
    return { success: true, data: branch, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch detail' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const branch = await this.branchService.findOne(id, user.tenantId);
    return { success: true, data: branch, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const branch = await this.branchService.update(id, user.tenantId, data);
    return { success: true, data: branch, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate branch (sets is_active = false)' })
  async deactivate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const branch = await this.branchService.deactivate(id, user.tenantId);
    return { success: true, data: branch, meta: null, error: null };
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Permanently delete a deactivated branch' })
  async hardDelete(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.branchService.hardDelete(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }

  // ── Plan-based Activation (TEMPORARY until subscription module) ────────────

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a branch under the org\'s subscription plan limit (operational activation, separate from soft-delete)' })
  async activate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const r = req as any;
    const branch = await this.branchActivationService.activate(user.tenantId, user.sub, id, {
      ipAddress: r.ip,
      userAgent: r.headers['user-agent'],
    });
    return { success: true, data: branch, meta: null, error: null };
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a branch\'s plan activation slot (frees the slot for another branch; data is preserved)' })
  async deactivatePlanActivation(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const r = req as any;
    const branch = await this.branchActivationService.deactivate(user.tenantId, user.sub, id, {
      ipAddress: r.ip,
      userAgent: r.headers['user-agent'],
    });
    return { success: true, data: branch, meta: null, error: null };
  }

  // ── User Access ─────────────────────────────────────────────────────────

  @Get(':id/access')
  @ApiOperation({ summary: 'List users with access to a branch' })
  async listAccess(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.branchAccessService.findByBranch(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/access')
  @ApiOperation({ summary: 'Grant user access to a branch' })
  async grantAccess(@Req() req: Request, @Param('id') id: string, @Body() body: { user_id: string; role: string }) {
    const user = (req as any).user;
    const data = await this.branchAccessService.grant(user.tenantId, id, user.sub, body);
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id/access/:userId')
  @ApiOperation({ summary: 'Revoke user access from a branch' })
  async revokeAccess(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    const user = (req as any).user;
    const data = await this.branchAccessService.revoke(user.tenantId, id, userId, user.sub);
    return { success: true, data, meta: null, error: null };
  }
}
