import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IntegrationsService } from '../services/integrations.service';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List integrations' })
  async getIntegrations(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const integrations = await this.service.getIntegrations(tenantId);
    return { success: true, data: integrations, error: null };
  }

  @Get('available')
  @ApiOperation({ summary: 'List available integration types' })
  async getAvailableIntegrations() {
    const integrations = await this.service.getAvailableIntegrations();
    return { success: true, data: integrations, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create/configure integration' })
  async createIntegration(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const integration = await this.service.createIntegration(tenantId, data);
    return { success: true, data: integration, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update integration' })
  async updateIntegration(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const integration = await this.service.updateIntegration(id, tenantId, data);
    return { success: true, data: integration, error: null };
  }

  @Put(':id/toggle')
  @ApiOperation({ summary: 'Toggle integration active state' })
  async toggleIntegration(@Req() req: Request, @Param('id') id: string, @Body() data: { is_active: boolean }) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const integration = await this.service.toggleIntegration(id, tenantId, data.is_active);
    return { success: true, data: integration, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete integration' })
  async deleteIntegration(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteIntegration(id, tenantId);
    return { success: true, error: null };
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List webhooks' })
  async getWebhooks(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const webhooks = await this.service.getWebhooks(tenantId);
    return { success: true, data: webhooks, error: null };
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'Create webhook' })
  async createWebhook(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const webhook = await this.service.createWebhook(tenantId, data);
    return { success: true, data: webhook, error: null };
  }

  @Delete('webhooks/:id')
  @ApiOperation({ summary: 'Delete webhook' })
  async deleteWebhook(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteWebhook(id, tenantId);
    return { success: true, error: null };
  }

  @Get('sync-logs')
  @ApiOperation({ summary: 'List sync logs' })
  async getSyncLogs(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const logs = await this.service.getSyncLogs(tenantId);
    return { success: true, data: logs, error: null };
  }

  @Post('sync-logs')
  @ApiOperation({ summary: 'Create sync log entry' })
  async createSyncLog(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const log = await this.service.createSyncLog(tenantId, data);
    return { success: true, data: log, error: null };
  }
}
