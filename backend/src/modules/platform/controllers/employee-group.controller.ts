import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmployeeGroupService } from '../services/designation.service';

@ApiTags('Employee Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employee-groups')
export class EmployeeGroupController {
  constructor(private readonly service: EmployeeGroupService) {}

  @Get()
  async findAll(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.service.findAll(user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.create(user.tenantId, data);
    return { success: true, data: item, meta: null, error: null };
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const item = await this.service.update(id, user.tenantId, data);
    return { success: true, data: item, meta: null, error: null };
  }

  @Post(':id/members')
  async addMembers(@Req() req: Request, @Param('id') id: string, @Body() body: { employeeIds: string[] }) {
    const user = (req as any).user;
    await this.service.addMembers(id, user.tenantId, body.employeeIds);
    return { success: true, data: null, meta: null, error: null };
  }

  @Delete(':id/members/:employeeId')
  async removeMember(@Req() req: Request, @Param('id') id: string, @Param('employeeId') employeeId: string) {
    const user = (req as any).user;
    await this.service.removeMember(id, user.tenantId, employeeId);
    return { success: true, data: null, meta: null, error: null };
  }
}
