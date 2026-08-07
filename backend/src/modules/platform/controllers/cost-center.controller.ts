import { Controller, Get, Post, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CostCenterService } from '../services/designation.service';

@ApiTags('Cost Centers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cost-centers')
export class CostCenterController {
  constructor(private readonly service: CostCenterService) {}

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
}
