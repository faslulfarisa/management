import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DesignationService } from '../services/designation.service';

@ApiTags('Designations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('designations')
export class DesignationController {
  constructor(private readonly service: DesignationService) {}

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

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }
}
