import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, BadRequestException
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { BillingService } from '../services/billing.service';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List subscription plans' })
  async getPlans(@Query('includeInactive') includeInactive?: string) {
    const plans = await this.service.getPlans(includeInactive === 'true');
    return { success: true, data: plans, error: null };
  }

  @Get('modules')
  @ApiOperation({ summary: 'List modules' })
  async getModules(@Query('includeInactive') includeInactive?: string) {
    const modules = await this.service.getModules(includeInactive === 'true');
    return { success: true, data: modules, error: null };
  }

  @Get('features')
  @ApiOperation({ summary: 'List features' })
  async getFeatures(@Query('includeInactive') includeInactive?: string) {
    const features = await this.service.getFeatures(includeInactive === 'true');
    return { success: true, data: features, error: null };
  }

  @Get('resources')
  @ApiOperation({ summary: 'List resources' })
  async getResources(@Query('includeInactive') includeInactive?: string) {
    const resources = await this.service.getResources(includeInactive === 'true');
    return { success: true, data: resources, error: null };
  }

  @Post('calculate-price')
  @ApiOperation({ summary: 'Calculate subscription price dynamically' })
  async calculatePrice(@Body() data: any) {
    // We can just proxy to engine through service, but let's assume service handles it
    // Wait, let's inject engine in controller? No, I'll add calculatePrice to BillingService
    const engine = (this.service as any).engine;
    const pricing = await engine.calculateSubscriptionPrice(
      data.plan_id,
      data.billing_cycle,
      data.selected_modules || [],
      data.selected_features || [],
      data.resource_quantities || {},
      data.discount_code
    );
    return { success: true, data: pricing, error: null };
  }

  // Plan definitions are a platform-wide resource (pricing/features/limits
  // shared across every tenant), never tenant-scoped — mutating them is
  // Platform-only as of Phase 4 of the Platform/Customer separation. This
  // used to be reachable by any authenticated user (a real authorization
  // gap); now it requires internal staff with BILLING_MANAGE_PLANS (Finance
  // or Platform Super Admin by default).
  @Post('plans')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Create subscription plan (Platform only)' })
  async createPlan(@Body() data: any) {
    const plan = await this.service.createPlan(data);
    return { success: true, data: plan, error: null };
  }

  @Put('plans/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Update subscription plan (Platform only)' })
  async updatePlan(@Param('id') id: string, @Body() data: any) {
    const plan = await this.service.updatePlan(id, data);
    return { success: true, data: plan, error: null };
  }

  @Delete('plans/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Deactivate subscription plan (Platform only)' })
  async deletePlan(@Param('id') id: string) {
    await this.service.deletePlan(id);
    return { success: true, error: null };
  }

  // --- MODULES CRUD ---
  @Post('modules')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Create module (Platform only)' })
  async createModule(@Body() data: any) {
    const module = await this.service.createModule(data);
    return { success: true, data: module, error: null };
  }

  @Put('modules/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Update module (Platform only)' })
  async updateModule(@Param('id') id: string, @Body() data: any) {
    const module = await this.service.updateModule(id, data);
    return { success: true, data: module, error: null };
  }

  @Delete('modules/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Deactivate module (Platform only)' })
  async deleteModule(@Param('id') id: string) {
    await this.service.deleteModule(id);
    return { success: true, error: null };
  }

  // --- FEATURES CRUD ---
  @Post('features')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Create feature (Platform only)' })
  async createFeature(@Body() data: any) {
    const feature = await this.service.createFeature(data);
    return { success: true, data: feature, error: null };
  }

  @Put('features/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Update feature (Platform only)' })
  async updateFeature(@Param('id') id: string, @Body() data: any) {
    const feature = await this.service.updateFeature(id, data);
    return { success: true, data: feature, error: null };
  }

  @Delete('features/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Deactivate feature (Platform only)' })
  async deleteFeature(@Param('id') id: string) {
    await this.service.deleteFeature(id);
    return { success: true, error: null };
  }

  // --- RESOURCES CRUD ---
  @Post('resources')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Create resource (Platform only)' })
  async createResource(@Body() data: any) {
    const resource = await this.service.createResource(data);
    return { success: true, data: resource, error: null };
  }

  @Put('resources/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Update resource (Platform only)' })
  async updateResource(@Param('id') id: string, @Body() data: any) {
    const resource = await this.service.updateResource(id, data);
    return { success: true, data: resource, error: null };
  }

  @Delete('resources/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.BILLING_MANAGE_PLANS)
  @ApiOperation({ summary: 'Deactivate resource (Platform only)' })
  async deleteResource(@Param('id') id: string) {
    await this.service.deleteResource(id);
    return { success: true, error: null };
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription' })
  async getSubscription(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const subscription = await this.service.getSubscription(tenantId);
    
    const { rows: tenantRows } = await this.service.getTenantCurrency(tenantId);
    const currency = tenantRows[0]?.currency || 'INR';
    const currencySymbol = tenantRows[0]?.currency_symbol || '₹';

    return { 
      success: true, 
      data: subscription, 
      meta: { currency, currency_symbol: currencySymbol },
      error: null 
    };
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Request to upgrade plan (Creates a pending change request)' })
  async subscribe(@Req() req: Request, @Body() data: { plan_id: string; billing_cycle: 'monthly' | 'yearly' }) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.sub;

    try {
      const request = await this.service.submitPlanUpgradeRequest(tenantId, data, userId);
      return { success: true, data: request, error: null };
    } catch (err: any) {
      console.error('SUBSCRIBE ERROR:', err);
      throw new BadRequestException(err.message || 'Subscription failed');
    }
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel subscription' })
  async cancelSubscription(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const subscription = await this.service.cancelSubscription(tenantId);
    return { success: true, data: subscription, error: null };
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List subscription invoices' })
  async getInvoices(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const invoices = await this.service.getInvoices(tenantId);
    return { success: true, data: invoices, error: null };
  }

  @Post('invoices/:id/pay')
  @ApiOperation({ summary: 'Pay an invoice' })
  async payInvoice(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const invoice = await this.service.payInvoice(id, tenantId, data);
    return { success: true, data: invoice, error: null };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List payment transactions' })
  async getTransactions(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const transactions = await this.service.getTransactions(tenantId);
    return { success: true, data: transactions, error: null };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Billing summary' })
  async getSummary(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const summary = await this.service.getSummary(tenantId);
    return { success: true, data: summary, error: null };
  }
}
