import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserService } from '../services/user.service';
import { UserHierarchyService, SetUserAccessInput } from '../services/user-hierarchy.service';
import { BranchService } from '../services/branch.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly service: UserService,
    private readonly hierarchyService: UserHierarchyService,
    private readonly branchService: BranchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  async findAll(@Req() req: Request, @Query('page') page: string, @Query('limit') limit: string, @Query('organizationId') organizationId?: string) {
    const user = (req as any).user;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    const accessScope = await this.hierarchyService.getAccessScope(user, targetTenantId);
    const result = await this.service.findAll(targetTenantId, parseInt(page) || 1, parseInt(limit) || 20, accessScope);
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create user (invite)' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const { organizationId, ...rest } = data;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' as const : user.userType };
    const newUser = await this.service.create(targetTenantId, rest, actor);
    return { success: true, data: newUser, meta: null, error: null };
  }

  @Post('bulk-import/preview')
  @ApiOperation({ summary: 'Generate & validate usernames/passwords for a bulk user import file' })
  async previewBulkImport(@Req() req: Request, @Body() body: { rows: any[] }) {
    const user = (req as any).user;
    const results = await this.service.previewBulkImport(user.tenantId, body.rows || []);
    return { success: true, data: results, meta: null, error: null };
  }

  @Get('check-username')
  @ApiOperation({ summary: 'Real-time username availability check, used while editing the bulk-import preview' })
  async checkUsername(@Req() req: Request, @Query('username') username: string, @Query('excludeUserId') excludeUserId?: string) {
    const user = (req as any).user;
    const result = await this.service.checkUsernameAvailable(user.tenantId, username || '', excludeUserId);
    return { success: true, data: result, meta: null, error: null };
  }

  @Get('directory')
  @ApiOperation({ summary: 'Search all users and unlinked employees (unified directory)' })
  async searchDirectory(@Req() req: Request, @Query('q') q: string) {
    const user = (req as any).user;
    const results = await this.service.searchDirectory(user.tenantId, q ?? '');
    return { success: true, data: results, meta: null, error: null };
  }

  @Get('admins')
  @ApiOperation({ summary: 'List users with above-employee standing (org/branch admins), eligible to be named approvers' })
  async listAdmins(@Req() req: Request) {
    const user = (req as any).user;
    const results = await this.service.listElevatedUsers(user.tenantId);
    return { success: true, data: results, meta: null, error: null };
  }

  @Get('hierarchy/manageable-types')
  @ApiOperation({ summary: 'List user types the current user can assign, plus assignable branches' })
  async getManageableTypes(@Req() req: Request) {
    const user = (req as any).user;
    const actorType = user.isSuperAdmin ? 'super_admin' : user.userType;
    const types = this.hierarchyService.getManageableTypes(actorType);

    let branches: any[] = [];
    if ((types.includes('branch_admin') || types.includes('admin')) && user.tenantId) {
      const allBranches = await this.branchService.findAll(user.tenantId);
      const accessScope = await this.hierarchyService.getAccessScope(user, user.tenantId);
      branches = accessScope.isGlobalAccess
        ? allBranches
        : allBranches.filter((b: any) => accessScope.branchIds.includes(b.id));
    }

    return { success: true, data: { types, branches }, meta: null, error: null };
  }

  @Get('deactivation-reasons')
  @ApiOperation({ summary: 'List available deactivation reasons' })
  async getDeactivationReasons(@Req() req: Request) {
    const user = (req as any).user;
    const reasons = await this.service.getDeactivationReasons(user.tenantId);
    return { success: true, data: reasons, meta: null, error: null };
  }

  @Get(':id/access')
  @ApiOperation({ summary: 'Get a user\'s hierarchy/scope access' })
  async getAccess(@Req() req: Request, @Param('id') id: string, @Query('organizationId') organizationId?: string) {
    const user = (req as any).user;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    await this.hierarchyService.assertUserInScope(user, id, targetTenantId);
    const access = await this.hierarchyService.getUserAccess(id, targetTenantId);
    return { success: true, data: access, meta: null, error: null };
  }

  @Patch(':id/access')
  @ApiOperation({ summary: 'Set a user\'s hierarchy type and scope (organizations/branches/position)' })
  async setAccess(@Req() req: Request, @Param('id') id: string, @Body() body: SetUserAccessInput & { organizationId?: string }) {
    const user = (req as any).user;
    const { organizationId, ...accessInput } = body;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' as const : user.userType };
    await this.hierarchyService.assertUserInScope(actor, id, targetTenantId);
    const access = await this.hierarchyService.setUserAccess(actor, id, targetTenantId, accessInput);
    return { success: true, data: access, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const found = await this.service.findOne(id, user.tenantId);
    return { success: true, data: found, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const updated = await this.service.update(id, user.tenantId, data);
    return { success: true, data: updated, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete an already-deactivated user (soft delete)' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    if (!user.isSuperAdmin && user.userType !== 'org_admin') {
      throw new ForbiddenException('Only organization or super administrators can delete users');
    }
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' : user.userType };
    await this.service.remove(id, user.tenantId, actor, req.ip, req.headers['user-agent']);
    return { success: true, data: null, meta: null, error: null };
  }

  @Post(':id/unlock')
  @ApiOperation({ summary: 'Reactivate a locked user account' })
  async unlock(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    if (!user.isSuperAdmin && user.userType === 'employee') {
      throw new ForbiddenException('Only administrators can unlock accounts');
    }
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' : user.userType };
    const result = await this.service.unlockUser(id, user.tenantId, actor, req.ip, req.headers['user-agent']);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user account with a reason' })
  async deactivate(@Req() req: Request, @Param('id') id: string, @Body() body: { reasonId: string; notes?: string }) {
    const user = (req as any).user;
    if (!user.isSuperAdmin && user.userType === 'employee') {
      throw new ForbiddenException('Only administrators can deactivate accounts');
    }
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' : user.userType };
    const result = await this.service.deactivate(id, user.tenantId, body.reasonId, body.notes, actor, req.ip, req.headers['user-agent']);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a deactivated user account' })
  async reactivate(@Req() req: Request, @Param('id') id: string, @Body() body: { notes?: string }) {
    const user = (req as any).user;
    if (!user.isSuperAdmin && user.userType === 'employee') {
      throw new ForbiddenException('Only administrators can reactivate accounts');
    }
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const actor = { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' : user.userType };
    const result = await this.service.reactivate(id, user.tenantId, actor, body.notes, req.ip, req.headers['user-agent']);
    return { success: true, data: result, meta: null, error: null };
  }

  @Get(':id/status-history')
  @ApiOperation({ summary: 'Get account status change history for a user' })
  async getStatusHistory(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const history = await this.service.getStatusHistory(id, user.tenantId);
    return { success: true, data: history, meta: null, error: null };
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Assign/update roles for user' })
  async assignRoles(@Req() req: Request, @Param('id') id: string, @Body() body: { roles: { roleId: string; scopeType?: string; scopeId?: string }[] }) {
    const user = (req as any).user;
    await this.hierarchyService.assertUserInScope(user, id, user.tenantId);
    const updated = await this.service.assignRoles(id, user.tenantId, body.roles);
    return { success: true, data: updated, meta: null, error: null };
  }
}
