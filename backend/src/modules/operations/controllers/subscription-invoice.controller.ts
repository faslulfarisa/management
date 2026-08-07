import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import {
  CreateSubscriptionInvoiceDto,
  ListSubscriptionInvoicesQueryDto,
  MarkSubscriptionInvoicePaidDto,
  UpdateSubscriptionInvoiceDto,
  VoidSubscriptionInvoiceDto,
} from '../dto/subscription-invoice.dto';
import { SubscriptionInvoiceService } from '../services/subscription-invoice.service';

@ApiTags('Operations - Subscription Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/subscription-invoices')
export class SubscriptionInvoiceController {
  constructor(private readonly service: SubscriptionInvoiceService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'List subscription invoices across organizations' })
  async list(@Query() query: ListSubscriptionInvoicesQueryDto) {
    const result = await this.service.list(query);
    return { success: true, ...result, error: null };
  }

  @Get('summary')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Subscription invoice summary counters' })
  async summary() {
    const data = await this.service.summary();
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_VIEW_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Get subscription invoice detail' })
  async detail(@Param('id') id: string) {
    const data = await this.service.detail(id);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Create a subscription invoice for an organization' })
  async create(@Req() req: Request, @Body() body: CreateSubscriptionInvoiceDto) {
    const user = (req as any).user;
    const data = await this.service.create(body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Edit a pending subscription invoice' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateSubscriptionInvoiceDto) {
    const user = (req as any).user;
    const data = await this.service.update(id, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/mark-paid')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Mark a pending subscription invoice as paid' })
  async markPaid(@Req() req: Request, @Param('id') id: string, @Body() body: MarkSubscriptionInvoicePaidDto) {
    const user = (req as any).user;
    const data = await this.service.markPaid(id, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/void')
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Void a pending subscription invoice' })
  async void(@Req() req: Request, @Param('id') id: string, @Body() body: VoidSubscriptionInvoiceDto) {
    const user = (req as any).user;
    const data = await this.service.void(id, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }
}
