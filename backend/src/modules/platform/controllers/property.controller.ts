import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PropertyService } from '../services/property.service';

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get()
  @ApiOperation({ summary: 'List all properties' })
  async findAll(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.propertyService.findAll(user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create property' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const property = await this.propertyService.create(user.tenantId, data);
    return { success: true, data: property, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const property = await this.propertyService.findOne(id, user.tenantId);
    return { success: true, data: property, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update property' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const property = await this.propertyService.update(id, user.tenantId, data);
    return { success: true, data: property, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete property' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.propertyService.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }
}
