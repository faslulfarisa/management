import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DepartmentService } from '../services/department.service';
import { UserHierarchyService } from '../services/user-hierarchy.service';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('departments')
export class DepartmentController {
  constructor(
    private readonly deptService: DepartmentService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List departments with employee counts' })
  async findAll(
    @Req() req: Request,
    @Query('branch_id') branchId?: string,
    @Query('scope_type') scopeType?: string,
    @Query('head_employee_id') headEmployeeId?: string,
  ) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const data = await this.deptService.findAll(
      user.tenantId,
      { branch_id: branchId, scope_type: scopeType, head_employee_id: headEmployeeId },
      accessScope,
    );
    return { success: true, data, meta: null, error: null };
  }

  @Get('duplicates')
  @ApiOperation({ summary: 'List duplicate department groups' })
  async findDuplicates(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.deptService.findDuplicates(user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post('deduplicate')
  @ApiOperation({ summary: 'Merge duplicate departments (keeps most-staffed, reassigns employees)' })
  async deduplicate(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.deptService.deduplicate(user.tenantId);
    return { success: true, data: result, meta: null, error: null };
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Soft-delete multiple departments by ID' })
  async removeMany(@Req() req: Request, @Body() body: { ids: string[] }) {
    const user = (req as any).user;
    const removed = await this.deptService.removeMany(body.ids || [], user.tenantId);
    return { success: true, data: { removed }, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create department' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const r = req as any;
    const dept = await this.deptService.create(user.tenantId, data, {
      userId: user.sub,
      ipAddress: r.ip,
      userAgent: r.headers['user-agent'],
    });
    return { success: true, data: dept, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get department' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const dept = await this.deptService.findOne(id, user.tenantId);
    return { success: true, data: dept, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update department' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const r = req as any;
    const dept = await this.deptService.update(id, user.tenantId, data, {
      userId: user.sub,
      ipAddress: r.ip,
      userAgent: r.headers['user-agent'],
    });
    return { success: true, data: dept, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete department' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.deptService.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }
}
