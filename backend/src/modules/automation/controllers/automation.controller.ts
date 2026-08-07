import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AutomationService } from '../services/automation.service';

@ApiTags('Automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  @Get('rules')
  @ApiOperation({ summary: 'List automation rules' })
  async getRules(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const rules = await this.service.getRules(tenantId);
    return { success: true, data: rules, error: null };
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create automation rule' })
  async createRule(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const rule = await this.service.createRule(tenantId, data);
    return { success: true, data: rule, error: null };
  }

  @Put('rules/:id')
  @ApiOperation({ summary: 'Update automation rule' })
  async updateRule(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const rule = await this.service.updateRule(id, tenantId, data);
    return { success: true, data: rule, error: null };
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete automation rule' })
  async deleteRule(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteRule(id, tenantId);
    return { success: true, error: null };
  }

  @Get('logs')
  @ApiOperation({ summary: 'List automation logs' })
  async getLogs(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const logs = await this.service.getLogs(tenantId, query);
    return { success: true, data: logs, error: null };
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List scheduled tasks' })
  async getTasks(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const tasks = await this.service.getTasks(tenantId);
    return { success: true, data: tasks, error: null };
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create scheduled task' })
  async createTask(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const task = await this.service.createTask(tenantId, data);
    return { success: true, data: task, error: null };
  }

  @Put('tasks/:id')
  @ApiOperation({ summary: 'Update scheduled task' })
  async updateTask(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const task = await this.service.updateTask(id, tenantId, data);
    return { success: true, data: task, error: null };
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete scheduled task' })
  async deleteTask(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteTask(id, tenantId);
    return { success: true, error: null };
  }

  @Get('notifications')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'List notifications' })
  async getNotifications(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const notifications = await this.service.getNotifications(tenantId, user.sub);
    return { success: true, data: notifications, error: null };
  }

  @Post('notifications')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_SEND)
  @ApiOperation({ summary: 'Create notification' })
  async createNotification(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const notification = await this.service.createNotification(tenantId, data);
    return { success: true, data: notification, error: null };
  }

  @Post('notifications/:id/read')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markRead(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const notification = await this.service.markRead(id, tenantId, user.sub);
    return { success: true, data: notification, error: null };
  }

  @Post('notifications/read-all')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.markAllRead(user.sub, tenantId);
    return { success: true, error: null };
  }

  @Get('notifications/unread-count')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const count = await this.service.getUnreadCount(user.sub, tenantId);
    return { success: true, data: { count }, error: null };
  }
}
