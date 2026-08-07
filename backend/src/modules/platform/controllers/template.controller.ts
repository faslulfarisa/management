import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../services/user-hierarchy.service';
import { TemplateService } from '../services/template.service';
import { HolidayPolicyTemplateService } from '../services/holiday-policy-template.service';

@ApiTags('Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('templates')
export class TemplateController {
  constructor(
    private readonly service: TemplateService,
    private readonly holidayPolicy: HolidayPolicyTemplateService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async findAll(@Req() req: Request, @Query('type') type?: string) {
    const user = (req as any).user;
    const data = await this.service.findAll(user.tenantId, type);
    return { success: true, data, meta: { count: data.length }, error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_CREATE)
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.create(user.tenantId, user.sub, data);
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/duplicate')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_CREATE)
  async duplicate(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.duplicate(id, user.tenantId, user.sub, data);
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/archive')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_EDIT)
  async archive(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const item = await this.service.setStatus(id, user.tenantId, user.sub, 'archived');
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/activate')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_EDIT)
  async activate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const item = await this.service.setStatus(id, user.tenantId, user.sub, 'active');
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/deactivate')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_EDIT)
  async deactivate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const item = await this.service.setStatus(id, user.tenantId, user.sub, 'inactive');
    return { success: true, data: item, meta: null, error: null };
  }

  @Get('resolved')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async getResolved(
    @Req() req: Request,
    @Query('type') type: string,
    @Query('scope_type') scopeType: string,
    @Query('scope_id') scopeId: string,
  ) {
    const user = (req as any).user;
    const item = await this.service.getResolved(user.tenantId, type, scopeType, scopeId);
    return { success: true, data: item, meta: null, error: null };
  }

  @Get('my-sidebar')
  @ApiOperation({ summary: 'Get sidebar navigation configuration for the logged-in user' })
  async getMySidebar(@Req() req: Request) {
    const user = (req as any).user;
    const item = await this.service.getMySidebarAccess(user.sub, user.tenantId);
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/holidays/import')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_EDIT)
  async importHolidays(@Req() req: Request, @Param('id') id: string, @Body() body: { csv: string }) {
    const user = (req as any).user;
    const item = await this.holidayPolicy.importCsv(user.tenantId, user.sub, id, body.csv);
    return { success: true, data: item, meta: null, error: null };
  }

  @Get(':id/holidays/export')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async exportHolidays(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const csv = await this.holidayPolicy.exportCsv(user.tenantId, id);
    return { success: true, data: { csv }, meta: null, error: null };
  }

  @Get('holiday-policy/employees/:employeeId')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async employeeHolidays(@Req() req: Request, @Param('employeeId') employeeId: string, @Query() query: any) {
    const user = (req as any).user;
    const data = await this.holidayPolicy.listEmployeeHolidays(user.tenantId, employeeId, {
      date_from: query.date_from,
      date_to: query.date_to,
      upcoming: query.upcoming === 'true',
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return { success: true, data, meta: { count: data.length }, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const item = await this.service.findOne(id, user.tenantId);
    return { success: true, data: item, meta: null, error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_EDIT)
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.update(id, user.tenantId, data, user.sub);
    return { success: true, data: item, meta: null, error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_DELETE)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }

  @Post(':id/assign')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async assign(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.assign(user.tenantId, { ...data, template_id: id, user_id: user.sub });
    return { success: true, data: item, meta: null, error: null };
  }
}

@ApiTags('Template Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('template-assignments')
export class TemplateAssignmentController {
  constructor(
    private readonly service: TemplateService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_VIEW)
  async findAll(@Req() req: Request, @Query('template_id') templateId?: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.service.findAllAssignments(tenantId, templateId, accessScope);
    return { success: true, data, meta: { count: data.length }, error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.removeAssignment(id, user.tenantId, user.sub);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get(':id/exclusions')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async getExclusions(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.getExclusions(user.tenantId, id);
    return { success: true, data, meta: { count: data.length }, error: null };
  }

  @Post(':id/exclusions')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async addExclusion(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const item = await this.service.addExclusion(user.tenantId, id, body.employee_id, user.sub, body.reason);
    return { success: true, data: item, meta: null, error: null };
  }

  @Get(':id/effective-employees')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async getEffectiveEmployees(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.service.getEffectiveEmployees(tenantId, id, accessScope);
    return { success: true, data, meta: null, error: null };
  }
}

@ApiTags('Template Assignment Exclusions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('template-assignment-exclusions')
export class TemplateAssignmentExclusionController {
  constructor(private readonly service: TemplateService) {}

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_TEMPLATES_ASSIGN)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.removeExclusion(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }
}
