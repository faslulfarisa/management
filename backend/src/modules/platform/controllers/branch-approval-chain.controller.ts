import { Controller, Get, Post, Delete, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BranchApprovalChainService } from '../services/branch-approval-chain.service';

@UseGuards(JwtAuthGuard)
@Controller('branch-approval-chains')
export class BranchApprovalChainController {
  constructor(private readonly service: BranchApprovalChainService) {}

  @Get()
  async findAll(@Req() req: any, @Query('branch_id') branchId?: string) {
    const data = await this.service.findAll(req.user.tenantId, branchId);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const data = await this.service.findOne(id, req.user.tenantId);
    return { success: true, data };
  }

  @Post()
  async upsert(@Req() req: any, @Body() body: any) {
    const data = await this.service.upsert(req.user.tenantId, req.user.userId, body);
    return { success: true, data };
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string, @Req() req: any) {
    const data = await this.service.deactivate(id, req.user.tenantId);
    return { success: true, data };
  }

  @Patch(':id/activate')
  async activate(@Param('id') id: string, @Req() req: any) {
    const data = await this.service.activate(id, req.user.tenantId);
    return { success: true, data };
  }
}
