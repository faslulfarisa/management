import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { OrganizationFeatureManagementService } from '../services/organization-feature-management.service';
import {
  ApplyFeatureTemplateDto,
  SaveFeatureTemplateDto,
  UpdateOrganizationFeatureOverridesDto,
} from '../dto/organization-feature-management.dto';

@ApiTags('Operations - Organization Features')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/organization-features')
export class OrganizationFeatureManagementController {
  constructor(private readonly service: OrganizationFeatureManagementService) {}

  @Get('organizations')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW)
  @ApiOperation({ summary: 'List organizations for feature management' })
  async organizations(@Query() query: any) {
    const result = await this.service.listOrganizations(query);
    return { success: true, ...result, error: null };
  }

  @Get('templates')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW)
  @ApiOperation({ summary: 'List reusable organization feature templates' })
  async templates() {
    const data = await this.service.listTemplates();
    return { success: true, data, meta: null, error: null };
  }

  @Post('templates')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE)
  @ApiOperation({ summary: 'Create or update a feature template' })
  async saveTemplate(@Req() req: Request, @Body() body: SaveFeatureTemplateDto) {
    const user = (req as any).user;
    const data = await this.service.saveTemplate(body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Get(':tenantId')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_VIEW)
  @ApiOperation({ summary: 'Get organization feature matrix' })
  async detail(@Param('tenantId') tenantId: string) {
    const data = await this.service.getOrganizationFeatures(tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/overrides')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE)
  @ApiOperation({ summary: 'Set organization module and feature overrides' })
  async updateOverrides(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateOrganizationFeatureOverridesDto,
  ) {
    const user = (req as any).user;
    const data = await this.service.updateOverrides(tenantId, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/reset')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE)
  @ApiOperation({ summary: 'Reset organization overrides to subscription defaults' })
  async reset(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: { reason?: string }) {
    const user = (req as any).user;
    const data = await this.service.resetToSubscriptionDefaults(tenantId, { sub: user.sub }, body?.reason);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/apply-template')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATION_FEATURES_MANAGE)
  @ApiOperation({ summary: 'Apply a reusable feature template to an organization' })
  async applyTemplate(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: ApplyFeatureTemplateDto) {
    const user = (req as any).user;
    const data = await this.service.applyTemplate(tenantId, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }
}
