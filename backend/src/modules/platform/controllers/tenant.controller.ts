import {
  Controller, Get, Post, Delete, Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrgAdminGuard } from '../../auth/guards/org-admin.guard';
import { TenantService } from '../services/tenant.service';

/**
 * Read-only organization lookup + membership management. Organization
 * handling (create/edit/delete/suspend/activate/logo) lives exclusively in
 * the Internal Operations Portal (`/operations/organizations`) — see
 * `operations/controllers/organization-ops.controller.ts`. This controller
 * intentionally only keeps the routes still used outside that portal: the
 * org switcher and user-creation flows need to list/lookup organizations,
 * and members need to be added/removed when assigning a user to a tenant.
 */
@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organizations (super admin sees all, others see their own)' })
  async findAll(@Req() req: Request) {
    const user = (req as any).user;
    const tenants = await this.tenantService.findAllForUser(user.sub, user.isSuperAdmin);
    return { success: true, data: tenants, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details (own organization only, unless super admin)' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenant = await this.tenantService.findOne(id, user.sub, user.isSuperAdmin);
    return { success: true, data: tenant, meta: null, error: null };
  }

  @Get(':id/members')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'List members of an organization' })
  async getMembers(@Param('id') id: string) {
    const members = await this.tenantService.getMembers(id);
    return { success: true, data: members, meta: null, error: null };
  }

  @Post(':id/members')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Add member to organization' })
  async addMember(@Param('id') id: string, @Body() body: { userId: string }) {
    await this.tenantService.addMember(id, body.userId);
    return { success: true, data: null, meta: null, error: null };
  }

  @Delete(':id/members/:userId')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Remove member from organization' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.tenantService.removeMember(id, userId);
    return { success: true, data: null, meta: null, error: null };
  }
}
