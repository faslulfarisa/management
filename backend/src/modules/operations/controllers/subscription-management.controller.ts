import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { SubscriptionManagementService } from '../services/subscription-management.service';
import {
  AssignOpsSubscriptionDto,
  CancelOpsSubscriptionDto,
  RenewOpsSubscriptionDto,
  UpdateOpsSubscriptionDto,
} from '../dto/subscription-management.dto';

@ApiTags('Operations - Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/subscriptions')
export class SubscriptionManagementController {
  constructor(private readonly service: SubscriptionManagementService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'List organization subscription states' })
  async list(@Query() query: any) {
    const result = await this.service.list(query);
    return { success: true, ...result, error: null };
  }

  @Get('summary')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Subscription management summary counters' })
  async summary() {
    const data = await this.service.getSummary();
    return { success: true, data, meta: null, error: null };
  }

  @Get('catalog')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Plans, modules, features, and resources for subscription forms' })
  async catalog() {
    const data = await this.service.getCatalog();
    return { success: true, data, meta: null, error: null };
  }

  @Get(':tenantId')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Full organization subscription detail' })
  async detail(@Param('tenantId') tenantId: string) {
    const data = await this.service.getTenantSubscriptionDetail(tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/assign')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Assign or replace an organization subscription' })
  async assign(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: AssignOpsSubscriptionDto) {
    const user = (req as any).user;
    const data = await this.service.assign(tenantId, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Put(':tenantId/current')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Edit current organization subscription terms' })
  async updateCurrent(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: UpdateOpsSubscriptionDto) {
    const user = (req as any).user;
    const data = await this.service.updateCurrent(tenantId, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/renew')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Renew current organization subscription' })
  async renew(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: RenewOpsSubscriptionDto) {
    const user = (req as any).user;
    const data = await this.service.renew(tenantId, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':tenantId/cancel')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Cancel current organization subscription' })
  async cancel(@Req() req: Request, @Param('tenantId') tenantId: string, @Body() body: CancelOpsSubscriptionDto) {
    const user = (req as any).user;
    const data = await this.service.cancel(tenantId, { sub: user.sub }, body?.reason);
    return { success: true, data, meta: null, error: null };
  }
}
