import {
  Controller, Get, Post, Patch, Body, Param, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PayrollPaymentService } from '../services/payroll-payment.service';
import {
  InitiatePaymentDto,
  BulkInitiatePaymentsDto,
  MarkManualPaidDto,
  RetryPaymentDto,
  ReversePaymentDto,
} from '../dto/payment.dto';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('payroll')
export class PayrollPaymentController {
  constructor(private readonly service: PayrollPaymentService) {}

  private extract(req: any): { tenantId: string; userId: string; ip: string } {
    const user = req.user;
    return {
      tenantId: user.tenantId || user.tenant_id,
      userId: user.sub || user.id,
      ip: req.ip,
    };
  }

  @Post('payslips/:id/initiate-payment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a payment for a payslip' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  async initiatePayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    const { tenantId, userId, ip } = this.extract(req);
    const data = await this.service.initiatePayment(id, dto, userId, tenantId, ip);
    return { success: true, data, error: null };
  }

  @Get('payslips/:id/payments')
  @ApiOperation({ summary: 'List all payment attempts for a payslip' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  async getPaymentsByPayslip(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = this.extract(req);
    const data = await this.service.getPaymentsByPayslip(id, tenantId);
    return { success: true, data, error: null };
  }

  @Post('runs/:id/bulk-initiate-payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-initiate payments for all unpaid payslips in a payroll run' })
  @ApiParam({ name: 'id', description: 'Payroll run UUID' })
  async bulkInitiatePayments(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: BulkInitiatePaymentsDto,
  ) {
    const { tenantId, userId, ip } = this.extract(req);
    const data = await this.service.bulkInitiatePayments(id, dto, userId, tenantId, ip);
    return { success: true, data, error: null };
  }

  @Get('runs/:id/payments')
  @ApiOperation({ summary: 'List all payments for a payroll run' })
  @ApiParam({ name: 'id', description: 'Payroll run UUID' })
  async getPaymentsByRun(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = this.extract(req);
    const data = await this.service.getPaymentsByRun(id, tenantId);
    return { success: true, data, error: null };
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Get payment details' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  async getPaymentById(@Req() req: any, @Param('id') id: string) {
    const { tenantId } = this.extract(req);
    const data = await this.service.getPaymentById(id, tenantId);
    return { success: true, data, error: null };
  }

  @Patch('payments/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a manual payment (provide UTR / cheque reference)' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  async markManualPaid(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: MarkManualPaidDto,
  ) {
    const { tenantId, userId, ip } = this.extract(req);
    const data = await this.service.markManualPaid(id, dto, userId, tenantId, ip);
    return { success: true, data, error: null };
  }

  @Post('payments/:id/retry')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Retry a failed or cancelled payment' })
  @ApiParam({ name: 'id', description: 'Payment UUID of the failed payment' })
  async retryPayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RetryPaymentDto,
  ) {
    const { tenantId, userId, ip } = this.extract(req);
    const data = await this.service.retryPayment(id, dto, userId, tenantId, ip);
    return { success: true, data, error: null };
  }

  @Patch('payments/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a completed payment (Finance Manager / Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Payment UUID' })
  async reversePayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReversePaymentDto,
  ) {
    const { tenantId, userId, ip } = this.extract(req);
    const data = await this.service.reversePayment(id, dto, userId, tenantId, ip);
    return { success: true, data, error: null };
  }
}
