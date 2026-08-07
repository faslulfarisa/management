import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VendorService } from '../services/vendor.service';

@ApiTags('Vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get()
  @ApiOperation({ summary: 'List vendors' })
  async getVendors(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const vendors = await this.service.getVendors(tenantId, query);
    return { success: true, data: vendors, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create vendor' })
  async createVendor(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const vendor = await this.service.createVendor(tenantId, data);
    return { success: true, data: vendor, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vendor details' })
  async getVendor(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const vendor = await this.service.getVendor(id, tenantId);
    return { success: true, data: vendor, error: null };
  }

  @Get(':id/statement')
  @ApiOperation({ summary: 'Get vendor statement with associated bills' })
  async getVendorStatement(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const statement = await this.service.getVendorStatement(id, tenantId);
    return { success: true, data: statement, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update vendor' })
  async updateVendor(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const vendor = await this.service.updateVendor(id, tenantId, data);
    return { success: true, data: vendor, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete vendor' })
  async deleteVendor(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteVendor(id, tenantId);
    return { success: true, data: null, error: null };
  }
}
