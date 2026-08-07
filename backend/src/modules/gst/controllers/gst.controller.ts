import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GstService } from '../services/gst.service';

@ApiTags('GST')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gst')
export class GstController {
  constructor(private readonly service: GstService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get GST settings' })
  async getSettings(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const settings = await this.service.getSettings(tenantId);
    return { success: true, data: settings, error: null };
  }

  @Post('settings')
  @ApiOperation({ summary: 'Save GST settings' })
  async saveSettings(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const settings = await this.service.saveSettings(tenantId, data);
    return { success: true, data: settings, error: null };
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List GST invoices' })
  async getInvoices(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const invoices = await this.service.getInvoices(tenantId, query);
    return { success: true, data: invoices, error: null };
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create GST invoice' })
  async createInvoice(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const invoice = await this.service.createInvoice(tenantId, data);
    return { success: true, data: invoice, error: null };
  }

  @Get('returns')
  @ApiOperation({ summary: 'List GST returns' })
  async getReturns(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const returns = await this.service.getReturns(tenantId);
    return { success: true, data: returns, error: null };
  }

  @Post('returns/generate')
  @ApiOperation({ summary: 'Generate GST return' })
  async generateReturn(@Req() req: Request, @Body() data: { return_type: string; month: number; year: number }) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const returnData = await this.service.generateReturn(tenantId, data.return_type, data.month, data.year);
    return { success: true, data: returnData, error: null };
  }

  @Get('summary')
  @ApiOperation({ summary: 'GST summary' })
  async getSummary(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const summary = await this.service.getSummary(tenantId);
    return { success: true, data: summary, error: null };
  }
}
