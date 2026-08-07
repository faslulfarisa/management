import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { TaskService } from '../services/task.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get('stats')
  @RequirePermission(PERMISSIONS.TASKS_VIEW)
  @ApiOperation({ summary: 'Get task counts by status/priority' })
  async getStats(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return this.taskService.getStats(tenantId);
  }

  @Get()
  @RequirePermission(PERMISSIONS.TASKS_VIEW)
  @ApiOperation({ summary: 'List tasks' })
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigned_to') assigned_to?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return this.taskService.list(tenantId, {
      status,
      priority,
      assigned_to,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TASKS_VIEW)
  @ApiOperation({ summary: 'Get task by id' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return this.taskService.findOne(id, tenantId);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TASKS_CREATE)
  @ApiOperation({ summary: 'Create a task' })
  async create(@Req() req: any, @Body() body: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userId = req.user.sub || req.user.id;
    return this.taskService.create(tenantId, userId, body);
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.TASKS_EDIT)
  @ApiOperation({ summary: 'Update a task' })
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return this.taskService.update(id, tenantId, body);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.TASKS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel (soft-delete) a task' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return this.taskService.remove(id, tenantId);
  }
}
