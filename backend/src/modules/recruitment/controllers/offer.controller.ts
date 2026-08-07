import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { OfferService } from '../services/offer.service';
import { OfferApprovalService } from '../services/offer-approval.service';
import {
  AddNegotiationDto, ApproveOfferDto, CreateOfferDto, RejectOfferDto, SendOfferDto,
  UpdateOfferDto, WithdrawOfferDto,
} from '../dto/offer.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/offers')
export class OfferController {
  constructor(
    private readonly offers: OfferService,
    private readonly approvals: OfferApprovalService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.offers.list(tenantOf(req), {
      q: query.q, applicationId: query.application_id, status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.offers.findOne(id, tenantOf(req)), error: null };
  }

  @Get(':id/versions')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listVersions(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.offers.listVersions(id, tenantOf(req)), error: null };
  }

  @Post(':id/versions/:versionNumber/restore')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async restoreVersion(@Req() req: any, @Param('id') id: string, @Param('versionNumber') versionNumber: string) {
    return { success: true, data: await this.offers.restoreVersion(id, tenantOf(req), parseInt(versionNumber, 10), req.user.sub), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async create(@Req() req: any, @Body() dto: CreateOfferDto) {
    return { success: true, data: await this.offers.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return { success: true, data: await this.offers.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.offers.softDelete(id, tenantOf(req)), error: null };
  }

  // ── Approval workflow ────────────────────────────────────────────────
  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async submit(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveOfferDto) {
    return { success: true, data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip), error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectOfferDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }

  // ── Post-approval lifecycle ──────────────────────────────────────────
  @Post(':id/send')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async send(@Req() req: any, @Param('id') id: string, @Body() dto: SendOfferDto) {
    return { success: true, data: await this.offers.send(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/withdraw')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async withdraw(@Req() req: any, @Param('id') id: string, @Body() dto: WithdrawOfferDto) {
    return { success: true, data: await this.offers.withdraw(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Negotiation (recruiter side) ─────────────────────────────────────
  @Get(':id/negotiations')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listNegotiations(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.offers.listNegotiations(id, tenantOf(req)), error: null };
  }

  @Post(':id/negotiations')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async addNegotiation(@Req() req: any, @Param('id') id: string, @Body() dto: AddNegotiationDto) {
    return { success: true, data: await this.offers.addNegotiation(id, tenantOf(req), req.user.sub, dto), error: null };
  }
}
