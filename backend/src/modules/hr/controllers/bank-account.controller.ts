import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { BankAccountService } from '../services/bank-account.service';
import { BankDetailsValidationService } from '../services/bank-details-validation.service';
import { CreateBankAccountDto, UpdateBankAccountDto, VerifyBankAccountDto } from '../dto/bank-account.dto';

@ApiTags('Payroll - Bank Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('payroll/bank-accounts')
export class BankAccountController {
  constructor(
    private readonly bankAccounts: BankAccountService,
    private readonly validation: BankDetailsValidationService,
  ) {}

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'List bank accounts for an employee (account numbers masked)' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  async listByEmployee(@Req() req: any, @Param('employeeId') employeeId: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return {
      success: true,
      data: await this.bankAccounts.findByEmployee(tenantId, employeeId),
      error: null,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Add a bank account for an employee' })
  async create(@Req() req: any, @Body() dto: CreateBankAccountDto) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const createdBy = req.user.sub || req.user.id;
    return {
      success: true,
      data: await this.bankAccounts.create(tenantId, dto, createdBy, req.ip),
      error: null,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a bank account' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const updatedBy = req.user.sub || req.user.id;
    return {
      success: true,
      data: await this.bankAccounts.update(id, tenantId, dto, updatedBy, req.ip),
      error: null,
    };
  }

  @Patch(':id/set-primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a bank account as the primary payout account for an employee' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  async setPrimary(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const updatedBy = req.user.sub || req.user.id;
    return {
      success: true,
      data: await this.bankAccounts.setPrimary(id, tenantId, updatedBy, req.ip),
      error: null,
    };
  }

  @Patch(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a bank account as verified or failed' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  async verify(@Req() req: any, @Param('id') id: string, @Body() dto: VerifyBankAccountDto) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const verifiedBy = req.user.sub || req.user.id;
    return {
      success: true,
      data: await this.bankAccounts.verify(id, tenantId, dto, verifiedBy, req.ip),
      error: null,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a bank account (primary account cannot be deleted)' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const deletedBy = req.user.sub || req.user.id;
    await this.bankAccounts.remove(id, tenantId, deletedBy, req.ip);
    return { success: true, data: null, error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single bank account by ID (account number masked)' })
  @ApiParam({ name: 'id', description: 'Bank account UUID' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return {
      success: true,
      data: await this.bankAccounts.findById(id, tenantId),
      error: null,
    };
  }
}

@ApiTags('Payroll - Bank Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('payroll/runs')
export class PayrollBankValidationController {
  constructor(private readonly validation: BankDetailsValidationService) {}

  @Get(':id/validate-bank-details')
  @ApiOperation({
    summary: 'Validate bank account completeness for all employees in a payroll run',
  })
  @ApiParam({ name: 'id', description: 'Payroll run UUID' })
  async validate(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return {
      success: true,
      data: await this.validation.validatePayrollRun(id, tenantId),
      error: null,
    };
  }
}
