import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { SignupOfferService } from '../services/signup-offer.service';
import { CreateSignupOfferDto, UpdateSignupOfferDto, ToggleSignupOfferDto } from '../dto/signup-offer.dto';

/**
 * Signup incentive campaigns are a Platform/Marketing growth lever over new
 * organization signups, not a customer concern — relocated from the customer
 * admin dashboard (was super_admin-only via HierarchyGuard) to the Internal
 * Operations Portal in Phase 4 of the Platform/Customer separation, gated by
 * MARKETING_MANAGE_OFFERS (Marketing, or Platform Super Admin via
 * OpsPermissionGuard's standing bypass).
 */
@ApiTags('Signup Offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@RequireOpsPermission(OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS)
@Controller('signup-offers')
export class SignupOfferController {
  constructor(private readonly service: SignupOfferService) {}

  @Get()
  @ApiOperation({ summary: 'List all signup offers (Platform only)' })
  async findAll() {
    const data = await this.service.findAll();
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one signup offer (Platform only)' })
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create a signup offer (Platform only)' })
  async create(@Req() req: Request, @Body() dto: CreateSignupOfferDto) {
    const user = (req as any).user;
    const data = await this.service.create(dto, user.sub);
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a signup offer (Platform only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateSignupOfferDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/toggle')
  @ApiOperation({ summary: 'Activate or deactivate a signup offer (Platform only)' })
  async toggle(@Param('id') id: string, @Body() dto: ToggleSignupOfferDto) {
    const data = await this.service.toggleActive(id, dto.isActive);
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a signup offer that has never been redeemed (Platform only)' })
  async remove(@Param('id') id: string) {
    const data = await this.service.remove(id);
    return { success: true, data, meta: null, error: null };
  }
}
