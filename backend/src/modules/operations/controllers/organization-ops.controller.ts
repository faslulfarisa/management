import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { OrganizationLifecycleService } from '../services/organization-lifecycle.service';

@ApiTags('Operations - Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/organizations')
export class OrganizationOpsController {
  constructor(private readonly lifecycleService: OrganizationLifecycleService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'List organizations with lifecycle stage / search filters' })
  async findAll(@Query() query: any) {
    const data = await this.lifecycleService.findAll({
      stage: query.stage,
      search: query.search,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, ...data, error: null };
  }

  @Get(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Get organization details' })
  async findOne(@Param('id') id: string) {
    const data = await this.lifecycleService.findOne(id);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id/activity')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Audit trail for this organization' })
  async getActivity(@Param('id') id: string, @Query() query: any) {
    const result = await this.lifecycleService.getActivity(id, query);
    return { success: true, ...result, error: null };
  }

  @Post()
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_CREATE)
  @ApiOperation({ summary: 'Create a new organization (Sales)' })
  async create(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.lifecycleService.create(body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_EDIT)
  @ApiOperation({ summary: 'Update organization profile fields' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.lifecycleService.update(id, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_DELETE)
  @ApiOperation({ summary: 'Soft-delete an organization' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.lifecycleService.remove(id, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/transition')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Move an organization to a different lifecycle stage' })
  async transition(@Req() req: Request, @Param('id') id: string, @Body() body: { stage: string; reason?: string }) {
    const user = (req as any).user;
    const data = await this.lifecycleService.transitionStage(id, body.stage as any, { sub: user.sub }, body.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/suspend')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Suspend an organization' })
  async suspend(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const user = (req as any).user;
    const data = await this.lifecycleService.suspend(id, { sub: user.sub }, body?.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/activate')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Reactivate a suspended organization' })
  async activate(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const user = (req as any).user;
    const data = await this.lifecycleService.activate(id, { sub: user.sub }, body?.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/archive')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Archive an organization' })
  async archive(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const user = (req as any).user;
    const data = await this.lifecycleService.archive(id, { sub: user.sub }, body?.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/ownership')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Reassign the organization admin owner' })
  async changeOwnership(@Req() req: Request, @Param('id') id: string, @Body() body: { newOwnerUserId: string }) {
    const user = (req as any).user;
    const data = await this.lifecycleService.changeOwnership(id, body.newOwnerUserId, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }
}
