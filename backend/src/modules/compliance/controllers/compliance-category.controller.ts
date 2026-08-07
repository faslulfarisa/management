import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ComplianceCategoryService } from '../services/compliance-category.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/compliance-category.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/categories')
export class ComplianceCategoryController {
  constructor(private readonly service: ComplianceCategoryService) {}

  @Get()
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async list(@Req() req: any, @Query('scope') scope?: string) {
    return { success: true, data: await this.service.list(tenantOf(req), scope), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.COMPLIANCE_ADMIN)
  async create(@Req() req: any, @Body() dto: CreateCategoryDto) {
    return { success: true, data: await this.service.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_ADMIN)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return { success: true, data: await this.service.update(id, tenantOf(req), dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_ADMIN)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.service.remove(id, tenantOf(req)), error: null };
  }
}
