import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CommunicationService } from '../services/communication.service';
import { CreateCommunicationTemplateDto, UpdateCommunicationTemplateDto } from '../dto/pipeline.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Candidate Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/communication-templates')
export class CommunicationController {
  constructor(private readonly communication: CommunicationService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query('includeInactive') includeInactive?: string) {
    return { success: true, data: await this.communication.listTemplates(tenantOf(req), includeInactive === 'true'), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async create(@Req() req: any, @Body() dto: CreateCommunicationTemplateDto) {
    return { success: true, data: await this.communication.createTemplate(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCommunicationTemplateDto) {
    return { success: true, data: await this.communication.updateTemplate(id, tenantOf(req), dto), error: null };
  }
}
