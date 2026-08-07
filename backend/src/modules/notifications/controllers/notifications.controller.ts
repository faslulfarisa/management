import { Controller, Get, Post, Put, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { NotificationsService, NotificationActor } from '../services/notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  private actor(req: any): NotificationActor {
    const { sub, tenantId, userType, isSuperAdmin, employeeId } = req.user;
    return { sub, tenantId, userType, isSuperAdmin: !!isSuperAdmin, employeeId };
  }

  @Get()
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'List notifications (feed)' })
  async list(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const result = await this.service.list(actor, accessScope, {
      page: query.page,
      limit: query.limit,
      type: query.type,
      priority: query.priority,
      source_module: query.source_module,
      branch_id: query.branch_id,
      department_id: query.department_id,
      status: query.status,
      date_from: query.date_from,
      date_to: query.date_to,
      search: query.search,
    });
    return { success: true, data: result, error: null };
  }

  @Get('overview')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get notification center overview cards' })
  async overview(@Req() req: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getOverview(actor, accessScope);
    return { success: true, data, error: null };
  }

  @Get('action-required')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get action-required items (approval inbox)' })
  async actionRequired(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getActionRequired(actor, accessScope, {
      page: query.page,
      limit: query.limit,
      workflowType: query.workflow_type,
      branchId: query.branch_id,
      priority: query.priority,
    });
    return { success: true, data, error: null };
  }

  @Get('attendance-alerts')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get attendance alerts' })
  async attendanceAlerts(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getAttendanceAlerts(actor, accessScope, {
      branch_id: query.branch_id,
      department_id: query.department_id,
      employee_id: query.employee_id,
    });
    return { success: true, data, error: null };
  }

  @Get('payroll-alerts')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get payroll alerts' })
  async payrollAlerts(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getPayrollAlerts(actor, accessScope, { branch_id: query.branch_id });
    return { success: true, data, error: null };
  }

  @Get('employee-events')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get employee lifecycle events' })
  async employeeEvents(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getEmployeeEvents(actor, accessScope, { branch_id: query.branch_id });
    return { success: true, data, error: null };
  }

  @Get('documents-compliance')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get documents & compliance alerts' })
  async documentsCompliance(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getDocumentsCompliance(actor, accessScope, { branch_id: query.branch_id });
    return { success: true, data, error: null };
  }

  @Get('system-alerts')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get system alerts' })
  async systemAlerts(@Req() req: any, @Query() query: any) {
    const actor = this.actor(req);
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, actor.tenantId);
    const data = await this.service.getSystemAlerts(actor, accessScope, { branch_id: query.branch_id });
    return { success: true, data, error: null };
  }

  @Get('unread-count')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@Req() req: any) {
    const actor = this.actor(req);
    const count = await this.service.getUnreadCount(actor);
    return { success: true, data: { count }, error: null };
  }

  @Get('preferences')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Get notification channel preferences' })
  async getPreferences(@Req() req: any) {
    const actor = this.actor(req);
    const data = await this.service.getPreferences(actor);
    return { success: true, data, error: null };
  }

  @Put('preferences/:module')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Update notification channel preferences for a module' })
  async updatePreferences(@Req() req: any, @Param('module') module: string, @Body() body: any) {
    const actor = this.actor(req);
    const data = await this.service.updatePreferences(actor, module, {
      in_app: body.in_app,
      email: body.email,
      sms: body.sms,
      whatsapp: body.whatsapp,
    });
    return { success: true, data, error: null };
  }

  @Post('read-all')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@Req() req: any) {
    const actor = this.actor(req);
    await this.service.markAllRead(actor);
    return { success: true, error: null };
  }

  @Post(':id/read')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(@Req() req: any, @Param('id') id: string) {
    const actor = this.actor(req);
    const data = await this.service.markRead(id, actor);
    return { success: true, data, error: null };
  }

  @Post(':id/unread')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Mark a notification as unread' })
  async markUnread(@Req() req: any, @Param('id') id: string) {
    const actor = this.actor(req);
    const data = await this.service.markUnread(id, actor);
    return { success: true, data, error: null };
  }

  @Post(':id/archive')
  @RequirePermission(PERMISSIONS.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Archive a notification' })
  async archive(@Req() req: any, @Param('id') id: string) {
    const actor = this.actor(req);
    const data = await this.service.archive(id, actor);
    return { success: true, data, error: null };
  }
}
