import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BranchTransferService } from '../services/branch-transfer.service';

@ApiTags('Branch Transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class BranchTransferController {
  constructor(private readonly transferService: BranchTransferService) {}

  @Get()
  @ApiOperation({ summary: 'List transfers (filters: status, branch_id, employee_id)' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const data = await this.transferService.findAll(user.tenantId, query);
    return { success: true, data, meta: null, error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Initiate a branch transfer' })
  async initiate(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.transferService.initiate(user.tenantId, user.sub, body);
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer details' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.transferService.findOne(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id/approve')
  @ApiOperation({ summary: 'Approve a pending transfer' })
  async approve(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.transferService.approve(id, user.tenantId, user.sub);
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject a pending transfer' })
  async reject(@Req() req: Request, @Param('id') id: string, @Body() body: { rejection_reason?: string }) {
    const user = (req as any).user;
    const data = await this.transferService.reject(id, user.tenantId, user.sub, body.rejection_reason || '');
    return { success: true, data, meta: null, error: null };
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending transfer' })
  async cancel(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const data = await this.transferService.cancel(id, user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  // ── Deputation endpoints ────────────────────────────────────────────────────

  @Get('active-deputations')
  @ApiOperation({ summary: 'List active deputations (approved, not yet returned)' })
  async activeDeputations(@Req() req: Request, @Query('branch_id') branchId?: string) {
    const user = (req as any).user;
    const data = await this.transferService.getActiveDeputations(user.tenantId, branchId);
    return { success: true, data, meta: null, error: null };
  }

  @Post('deputations')
  @ApiOperation({ summary: 'Initiate a deputation (timed transfer with return date)' })
  async initiateDeputation(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const data = await this.transferService.initiateDeputation(user.tenantId, user.sub, body);
    return { success: true, data, meta: null, error: null };
  }

  @Post('process-deputation-reversions')
  @ApiOperation({ summary: 'Trigger auto-reversion for expired deputations (cron-callable)' })
  async processDeputationReversions(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.transferService.processExpiredDeputations(user.tenantId);
    return { success: true, data: result, meta: null, error: null };
  }
}
