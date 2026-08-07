import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { ComplianceTrackerService } from '../services/compliance-tracker.service';
import { CreateTrackerItemDto, UpdateTrackerItemDto } from '../dto/compliance-tracker.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Tracker')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance')
export class ComplianceTrackerController {
  constructor(
    private readonly tracker: ComplianceTrackerService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  // ── Statutory filings (legacy, unchanged behaviour) ─────────────────────
  @Get('filings')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async getFilings(@Req() req: any, @Query() query: any) {
    return { success: true, data: await this.tracker.getFilings(tenantOf(req), query), error: null };
  }

  @Post('filings')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async createFiling(@Req() req: any, @Body() data: any) {
    return { success: true, data: await this.tracker.createFiling(tenantOf(req), data), error: null };
  }

  @Put('filings/:id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async updateFiling(@Req() req: any, @Param('id') id: string, @Body() data: any) {
    return { success: true, data: await this.tracker.updateFiling(id, tenantOf(req), data), error: null };
  }

  @Delete('filings/:id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async removeFiling(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.tracker.removeFiling(id, tenantOf(req)), error: null };
  }

  // ── Generic compliance tracker items ────────────────────────────────────
  @Get('tracker-items')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async listItems(@Req() req: any, @Query() query: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { success: true, data: await this.tracker.listItems(tenantOf(req), scope, { complianceType: query.complianceType, status: query.status }), error: null };
  }

  @Post('tracker-items')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async createItem(@Req() req: any, @Body() dto: CreateTrackerItemDto) {
    return { success: true, data: await this.tracker.createItem(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put('tracker-items/:id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async updateItem(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTrackerItemDto) {
    return { success: true, data: await this.tracker.updateItem(id, tenantOf(req), dto), error: null };
  }

  @Post('tracker-items/:id/documents/:documentId')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async linkDocument(@Req() req: any, @Param('id') id: string, @Param('documentId') documentId: string) {
    return { success: true, data: await this.tracker.linkDocument(id, documentId, tenantOf(req)), error: null };
  }

  @Delete('tracker-items/:id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_TRACKER_MANAGE)
  async removeItem(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.tracker.removeItem(id, tenantOf(req)), error: null };
  }
}
