import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AssetTypeService } from '../services/asset-type.service';
import { AssetItemService } from '../services/asset-item.service';
import { AssetAssignmentService } from '../services/asset-assignment.service';
import { CreateAssetTypeDto, CreateAssetItemDto, AssignAssetDto, UpdateAssignmentDto, RecordAssetReturnDto } from '../dto/asset.dto';

@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('assets')
export class AssetController {
  constructor(
    private readonly typeService: AssetTypeService,
    private readonly itemService: AssetItemService,
    private readonly assignmentService: AssetAssignmentService,
  ) {}

  @Get('types')
  @RequirePermission(PERMISSIONS.ASSETS_VIEW)
  async listTypes(@Req() req: any) {
    return { data: await this.typeService.list(req.user.tenantId || req.user.tenant_id) };
  }

  @Post('types')
  @RequirePermission(PERMISSIONS.ASSETS_MANAGE)
  async createType(@Req() req: any, @Body() body: CreateAssetTypeDto) {
    return { data: await this.typeService.create(req.user.tenantId || req.user.tenant_id, body) };
  }

  @Get('items')
  @RequirePermission(PERMISSIONS.ASSETS_VIEW)
  async listItems(@Req() req: any, @Query() query: any) {
    return { data: await this.itemService.list(req.user.tenantId || req.user.tenant_id, query) };
  }

  @Post('items')
  @RequirePermission(PERMISSIONS.ASSETS_MANAGE)
  async createItem(@Req() req: any, @Body() body: CreateAssetItemDto) {
    return { data: await this.itemService.create(req.user.tenantId || req.user.tenant_id, body) };
  }

  @Post('assignments')
  @RequirePermission(PERMISSIONS.ASSETS_MANAGE)
  async assign(@Req() req: any, @Body() body: AssignAssetDto) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { data: await this.assignmentService.assign(tenantId, body, req.user.sub) };
  }

  @Get('assignments')
  @RequirePermission(PERMISSIONS.ASSETS_VIEW)
  async listAllAssignments(@Req() req: any, @Query() query: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { data: await this.assignmentService.listAll(tenantId, query) };
  }

  @Get('assignments/employee/:employeeId')
  @RequirePermission(PERMISSIONS.ASSETS_VIEW)
  async listForEmployee(@Req() req: any, @Param('employeeId') employeeId: string) {
    return { data: await this.assignmentService.listForEmployee(req.user.tenantId || req.user.tenant_id, employeeId) };
  }

  @Get('assignments/exit/:exitRequestId')
  @RequirePermission(PERMISSIONS.ASSETS_VIEW)
  async listForExit(@Req() req: any, @Param('exitRequestId') exitRequestId: string) {
    return { data: await this.assignmentService.listForExit(req.user.tenantId || req.user.tenant_id, exitRequestId) };
  }

  @Patch('assignments/:id')
  @RequirePermission(PERMISSIONS.ASSETS_MANAGE)
  async updateAssignment(@Req() req: any, @Param('id') id: string, @Body() body: UpdateAssignmentDto) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { data: await this.assignmentService.update(tenantId, id, body) };
  }

  @Delete('assignments/:id')
  @RequirePermission(PERMISSIONS.ASSETS_MANAGE)
  async deleteAssignment(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { data: await this.assignmentService.delete(tenantId, id) };
  }

  @Put('assignments/:id/return')
  @RequirePermission(PERMISSIONS.ASSETS_RECOVER)
  async recordReturn(@Req() req: any, @Param('id') id: string, @Body() body: RecordAssetReturnDto) {
    return { data: await this.assignmentService.recordReturn(req.user.tenantId || req.user.tenant_id, id, body) };
  }
}
