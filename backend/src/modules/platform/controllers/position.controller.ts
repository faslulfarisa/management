import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PositionService } from '../services/position.service';

@ApiTags('Positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionController {
  constructor(private readonly service: PositionService) {}

  @Get()
  @ApiOperation({ summary: 'List all positions with counts' })
  async findAll(@Req() req: Request, @Query('organizationId') organizationId?: string) {
    const user = (req as any).user;
    const targetTenantId = user.isSuperAdmin && organizationId ? organizationId : user.tenantId;
    const data = await this.service.findAll(targetTenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Get('permissions/all')
  @ApiOperation({ summary: 'List all available permissions' })
  async getAllPermissions() {
    const data = await this.service.getAllPermissions();
    return { success: true, data, meta: null, error: null };
  }

  @Get('presets')
  @ApiOperation({ summary: 'List permission presets for each position category' })
  async getPresets() {
    const data = this.service.getPresets();
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position with permissions' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.findOne(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new position' })
  async create(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.service.create(user.tenantId, body);
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update position details' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.service.update(id, user.tenantId, body);
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a position' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.remove(id, user.tenantId);
    return { success: true, data: null, meta: null, error: null };
  }

  // ── Permission management ────────────────────────────────────────

  @Put(':id/permissions')
  @ApiOperation({ summary: 'Set permissions granted by this position' })
  async setPermissions(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { permissionIds: string[] },
  ) {
    const user = (req as any).user;
    const data = await this.service.setPermissions(user.tenantId, id, body.permissionIds);
    return { success: true, data, meta: null, error: null };
  }

  // ── User assignment ──────────────────────────────────────────────

  @Get(':id/users')
  @ApiOperation({ summary: 'List users assigned to a position' })
  async getPositionUsers(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.service.getPositionUsers(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Assign a user to this position' })
  async assignUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { userId: string; organizationId?: string },
  ) {
    const user = (req as any).user;
    const targetTenantId = user.isSuperAdmin && body.organizationId ? body.organizationId : user.tenantId;
    const data = await this.service.assignUser(targetTenantId, id, body.userId, user.sub);
    return { success: true, data, meta: null, error: null };
  }

  @Delete(':id/users/:userId')
  @ApiOperation({ summary: 'Remove a user from this position' })
  async unassignUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    const user = (req as any).user;
    await this.service.unassignUser(user.tenantId, userId);
    return { success: true, data: null, meta: null, error: null };
  }

  @Get('users/:userId/position')
  @ApiOperation({ summary: "Get a user's current position and effective permissions" })
  async getUserPosition(@Req() req: Request, @Param('userId') userId: string) {
    const user = (req as any).user;
    const [position, permissions] = await Promise.all([
      this.service.getUserPosition(userId, user.tenantId),
      this.service.getUserPermissions(userId, user.tenantId),
    ]);
    return { success: true, data: { position, permissions }, meta: null, error: null };
  }
}
