import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { PipelineStageService } from '../services/pipeline-stage.service';
import { CreatePipelineStageDto, UpdatePipelineStageDto } from '../dto/pipeline.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Pipeline Stages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/pipeline-stages')
export class PipelineStageController {
  constructor(private readonly stages: PipelineStageService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query('includeInactive') includeInactive?: string) {
    return { success: true, data: await this.stages.list(tenantOf(req), includeInactive === 'true'), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async create(@Req() req: any, @Body() dto: CreatePipelineStageDto) {
    return { success: true, data: await this.stages.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePipelineStageDto) {
    return { success: true, data: await this.stages.update(id, tenantOf(req), dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async deactivate(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.stages.deactivate(id, tenantOf(req)), error: null };
  }
}
