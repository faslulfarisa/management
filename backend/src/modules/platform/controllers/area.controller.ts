import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AreaService } from '../services/area.service';

@ApiTags('Areas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('areas')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @Get()
  @ApiOperation({ summary: 'List areas with device and employee counts' })
  async findAll(@Req() req: Request, @Query('branch_id') branchId?: string) {
    const user = (req as any).user;
    const data = await this.areaService.findAll(user.tenantId, { branch_id: branchId });
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create area' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const area = await this.areaService.create(user.tenantId, data);
    return { success: true, data: area, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get area' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const area = await this.areaService.findOne(id, user.tenantId);
    return { success: true, data: area, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update area' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const area = await this.areaService.update(id, user.tenantId, data);
    return { success: true, data: area, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete area' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.areaService.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }
}
