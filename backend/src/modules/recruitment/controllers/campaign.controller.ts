import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CampaignService } from '../services/campaign.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Recruitment Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.campaigns.list(tenantOf(req), {
      q: query.q, status: query.status, campaign_type: query.campaign_type,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.campaigns.findOne(id, tenantOf(req)), error: null };
  }

  @Get(':id/stats')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async stats(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.campaigns.getStats(id, tenantOf(req)), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateCampaignDto) {
    return { success: true, data: await this.campaigns.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return { success: true, data: await this.campaigns.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.campaigns.softDelete(id, tenantOf(req)), error: null };
  }
}
