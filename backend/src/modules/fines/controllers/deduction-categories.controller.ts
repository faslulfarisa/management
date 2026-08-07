import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { DeductionCategoriesService } from '../services/deduction-categories.service';

@ApiTags('Deduction Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('fines/categories')
export class DeductionCategoriesController {
  constructor(private readonly service: DeductionCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List deduction categories (org-wide + branch-specific)' })
  async getCategories(@Req() req: any, @Query() query: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    // Lazily ensure default categories exist
    await this.service.ensureDefaults(tenantId);
    return { success: true, data: await this.service.getCategories(tenantId, query), error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom deduction category' })
  async createCategory(@Req() req: any, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.createCategory(tenantId, dto), error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a deduction category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  async updateCategory(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.updateCategory(id, tenantId, dto), error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (deactivate) a deduction category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.deleteCategory(id, tenantId), error: null };
  }
}
