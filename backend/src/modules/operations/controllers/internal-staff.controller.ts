import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { InternalStaffService } from '../services/internal-staff.service';

/**
 * Provisioning for Platform staff accounts themselves. Moved here from
 * SuperAdminGuard in Phase 4 of the Platform/Customer separation — this is
 * now Platform Super Admin's exclusive responsibility, matching the spec's
 * "Platform Super Admin exclusively manages... the SaaS platform." A
 * customer is_super_admin account can no longer reach this (InternalStaffGuard
 * requires is_internal_staff), nor can any other internal_role (no role
 * besides platform_super_admin is granted STAFF_MANAGE by default).
 */
@ApiTags('Operations - Internal Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@RequireOpsPermission(OPS_PERMISSIONS.STAFF_MANAGE)
@Controller('operations/staff')
export class InternalStaffController {
  constructor(private readonly service: InternalStaffService) {}

  @Get()
  @ApiOperation({ summary: 'List internal staff (Marketing/Sales/Technical) accounts' })
  async findAll() {
    const data = await this.service.findAll();
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create an internal staff account (super admin only)' })
  async create(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.service.create(body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an internal staff account\'s team/tier or name' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.service.update(id, body, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an internal staff account' })
  async deactivate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.setActive(id, false, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate an internal staff account' })
  async reactivate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.setActive(id, true, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Reset an internal staff account\'s password' })
  async resetPassword(@Req() req: Request, @Param('id') id: string, @Body() body: { password: string }) {
    const user = (req as any).user;
    const data = await this.service.resetPassword(id, body.password, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete an already-deactivated internal staff account' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.remove(id, { sub: user.sub });
    return { success: true, data, meta: null, error: null };
  }
}
