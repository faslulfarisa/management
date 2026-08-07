import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleService } from '../services/role.service';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly service: RoleService) {}

  @Get()
  @ApiOperation({ summary: 'List all roles' })
  async findAll(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.service.findAll(user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create custom role' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const role = await this.service.create(user.tenantId, data, user.sub);
    return { success: true, data: role, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role with permissions' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const role = await this.service.findOneWithPermissions(id, user.tenantId);
    return { success: true, data: role, meta: null, error: null };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update role' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const role = await this.service.update(id, user.tenantId, data, user.sub);
    return { success: true, data: role, meta: null, error: null };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role (non-system only)' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    await this.service.remove(id, user.tenantId, user.sub);
    return { success: true, data: null, meta: null, error: null };
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: 'Set permissions for a role' })
  async setPermissions(@Req() req: Request, @Param('id') id: string, @Body() body: { permissionIds: string[] }) {
    const user = (req as any).user;
    const role = await this.service.setPermissions(user.tenantId, id, body.permissionIds, user.sub);
    return { success: true, data: role, meta: null, error: null };
  }
}

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionController {
  @Get()
  @ApiOperation({ summary: 'List all permissions' })
  async findAll() {
    return { success: true, data: [], meta: null, error: null };
  }
}
