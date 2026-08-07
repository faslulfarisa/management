import {
  Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { InterviewService } from '../services/interview.service';
import {
  CancelInterviewDto, CompleteInterviewDto, RescheduleInterviewDto,
  ScheduleInterviewDto, SubmitInterviewFeedbackDto,
} from '../dto/interview.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Interviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/interviews')
export class InterviewController {
  constructor(private readonly interviews: InterviewService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.interviews.list(tenantOf(req), {
      q: query.q, applicationId: query.application_id, candidateId: query.candidate_id, status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.interviews.findOne(id, tenantOf(req)), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async schedule(@Req() req: any, @Body() dto: ScheduleInterviewDto) {
    return { success: true, data: await this.interviews.schedule(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/reschedule')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async reschedule(@Req() req: any, @Param('id') id: string, @Body() dto: RescheduleInterviewDto) {
    return { success: true, data: await this.interviews.reschedule(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelInterviewDto) {
    return { success: true, data: await this.interviews.cancel(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/feedback')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async submitFeedback(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitInterviewFeedbackDto) {
    return { success: true, data: await this.interviews.submitFeedback(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/complete')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async complete(@Req() req: any, @Param('id') id: string, @Body() dto: CompleteInterviewDto) {
    return { success: true, data: await this.interviews.complete(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/no-show')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async markNoShow(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.interviews.markNoShow(id, tenantOf(req)), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.interviews.remove(id, tenantOf(req)), error: null };
  }
}
