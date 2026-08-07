import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DependencyCheckService } from '../services/dependency-check.service';

@ApiTags('Dependency Check')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dependency-check')
export class DependencyCheckController {
  constructor(private readonly svc: DependencyCheckService) {}

  @Get('branch/:id')
  @ApiOperation({ summary: 'Get dependency report for a branch before deletion' })
  async branch(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkBranch(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('department/:id')
  @ApiOperation({ summary: 'Get dependency report for a department before deletion' })
  async department(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkDepartment(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('area/:id')
  @ApiOperation({ summary: 'Get dependency report for an area before deletion' })
  async area(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkArea(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('position/:id')
  @ApiOperation({ summary: 'Get dependency report for a position before deletion' })
  async position(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkPosition(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('employee/:id')
  @ApiOperation({ summary: 'Get dependency report for an employee before deletion' })
  async employee(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkEmployee(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('template/:id')
  @ApiOperation({ summary: 'Get dependency report for a template before deletion' })
  async template(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.svc.checkTemplate(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }
}
