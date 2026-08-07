import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../services/user-hierarchy.service';
import { DocumentService } from '../services/document.service';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('documents')
export class DocumentController {
  constructor(
    private readonly service: DocumentService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.DOCUMENTS_VIEW)
  async findAll(@Req() req: Request, @Query('entity_type') entityType?: string, @Query('entity_id') entityId?: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    if (user.userType === 'employee') {
      entityType = 'employee';
      entityId = user.employeeId || user.employee_id;
    }
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.service.findAll(tenantId, entityType, entityId, accessScope);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.DOCUMENTS_UPLOAD)
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.create(user.tenantId, user.sub, data);
    return { success: true, data: item, meta: null, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.DOCUMENTS_VIEW)
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const item = await this.service.findOne(id, tenantId, accessScope);
    if (user.userType === 'employee' && (item.entity_type !== 'employee' || item.entity_id !== (user.employeeId || user.employee_id))) {
      throw new NotFoundException('Document not found');
    }
    return { success: true, data: item, meta: null, error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.DOCUMENTS_UPLOAD)
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const item = await this.service.update(id, tenantId, data, accessScope);
    return { success: true, data: item, meta: null, error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.DOCUMENTS_DELETE)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    await this.service.remove(id, tenantId, accessScope);
    return { success: true, data: null, meta: null, error: null };
  }

  @Post(':id/verify')
  @RequirePermission(PERMISSIONS.DOCUMENTS_UPLOAD)
  async verify(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const item = await this.service.verify(id, tenantId, user.sub, accessScope);
    return { success: true, data: item, meta: null, error: null };
  }

  @Get('expiring')
  @RequirePermission(PERMISSIONS.DOCUMENTS_VIEW)
  async getExpiring(@Req() req: Request, @Query('days') days: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.service.getExpiring(tenantId, parseInt(days) || 30, accessScope);
    return { success: true, data, meta: null, error: null };
  }
}
