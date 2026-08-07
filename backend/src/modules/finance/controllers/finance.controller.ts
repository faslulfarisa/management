import {
  Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FinanceService } from '../services/finance.service';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  private getUser(req: Request) {
    const u = (req as any).user || (req as any);
    return { tenantId: u.tenantId || u.tenant_id, userId: u.sub || u.id };
  }

  /* ─── Summary & Reports ─────────────────────────────────────────────── */
  @Get('summary')
  @ApiOperation({ summary: 'Finance summary KPIs' })
  async getSummary(@Req() req: Request) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getSummary(tenantId), error: null };
  }

  @Get('reports/pl')
  @ApiOperation({ summary: 'Profit & Loss report by month' })
  async getPl(@Req() req: Request, @Query('year') year?: string) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getPlReport(tenantId, year ? parseInt(year) : undefined), error: null };
  }

  @Get('reports/aging')
  @ApiOperation({ summary: 'AR aging report' })
  async getAging(@Req() req: Request) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getArAgingReport(tenantId), error: null };
  }

  /* ─── Accounts ──────────────────────────────────────────────────────── */
  @Get('accounts')
  @ApiOperation({ summary: 'List chart of accounts' })
  async getAccounts(@Req() req: Request) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getAccounts(tenantId), error: null };
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Create account' })
  async createAccount(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createAccount(tenantId, userId, data), error: null };
  }

  /* ─── Journal Entries ───────────────────────────────────────────────── */
  @Get('journal-entries')
  @ApiOperation({ summary: 'List journal entries' })
  async getJournalEntries(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getJournalEntries(tenantId, query), error: null };
  }

  @Post('journal-entries')
  @ApiOperation({ summary: 'Create journal entry' })
  async createJournalEntry(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createJournalEntry(tenantId, userId, data), error: null };
  }

  @Post('journal-entries/:id/approve')
  @ApiOperation({ summary: 'Approve journal entry' })
  async approveJournalEntry(@Req() req: Request, @Param('id') id: string) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.approveJournalEntry(id, tenantId, userId), error: null };
  }

  /* ─── Expenses ──────────────────────────────────────────────────────── */
  @Get('expenses')
  @ApiOperation({ summary: 'List expenses' })
  async getExpenses(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getExpenses(tenantId, query), error: null };
  }

  @Post('expenses')
  @ApiOperation({ summary: 'Create expense' })
  async createExpense(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createExpense(tenantId, userId, data), error: null };
  }

  @Post('expenses/:id/approve')
  @ApiOperation({ summary: 'Approve expense' })
  async approveExpense(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.approveExpense(id, tenantId, userId, body.reason), error: null };
  }

  @Post('expenses/:id/reject')
  @ApiOperation({ summary: 'Reject expense' })
  async rejectExpense(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.rejectExpense(id, tenantId, userId, body.reason), error: null };
  }

  /* ─── Invoices ──────────────────────────────────────────────────────── */
  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  async getInvoices(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getInvoices(tenantId, query), error: null };
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create invoice' })
  async createInvoice(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createInvoice(tenantId, userId, data), error: null };
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async getInvoiceById(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getInvoiceById(id, tenantId), error: null };
  }

  @Put('invoices/:id')
  @ApiOperation({ summary: 'Update invoice' })
  async updateInvoice(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.updateInvoice(id, tenantId, userId, data), error: null };
  }

  @Post('invoices/:id/send')
  @ApiOperation({ summary: 'Mark invoice as sent' })
  async sendInvoice(@Req() req: Request, @Param('id') id: string) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.sendInvoice(id, tenantId, userId), error: null };
  }

  @Post('invoices/:id/mark-paid')
  @ApiOperation({ summary: 'Mark invoice as paid' })
  async markInvoicePaid(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.markInvoicePaid(id, tenantId, userId, data), error: null };
  }

  /* ─── Vendor Bills ──────────────────────────────────────────────────── */
  @Get('bills')
  @ApiOperation({ summary: 'List vendor bills' })
  async getBills(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getBills(tenantId, query), error: null };
  }

  @Post('bills')
  @ApiOperation({ summary: 'Create vendor bill' })
  async createBill(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createBill(tenantId, userId, data), error: null };
  }

  @Get('bills/:id')
  @ApiOperation({ summary: 'Get bill by ID' })
  async getBillById(@Req() req: Request, @Param('id') id: string) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getBillById(id, tenantId), error: null };
  }

  @Post('bills/:id/approve')
  @ApiOperation({ summary: 'Approve vendor bill' })
  async approveBill(@Req() req: Request, @Param('id') id: string) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.approveBill(id, tenantId, userId), error: null };
  }

  @Post('bills/:id/pay')
  @ApiOperation({ summary: 'Pay vendor bill' })
  async payBill(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.payBill(id, tenantId, userId, data), error: null };
  }

  /* ─── Payments ──────────────────────────────────────────────────────── */
  @Get('payments')
  @ApiOperation({ summary: 'List payments' })
  async getPayments(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getPayments(tenantId, query), error: null };
  }

  /* ─── Cashbook ──────────────────────────────────────────────────────── */
  @Get('cashbook')
  @ApiOperation({ summary: 'List cashbook entries' })
  async getCashbook(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getCashbook(tenantId, query), error: null };
  }

  @Post('cashbook')
  @ApiOperation({ summary: 'Create cashbook entry' })
  async createCashbookEntry(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createCashbookEntry(tenantId, userId, data), error: null };
  }

  /* ─── Budgets ───────────────────────────────────────────────────────── */
  @Get('budgets')
  @ApiOperation({ summary: 'List budgets' })
  async getBudgets(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getBudgets(tenantId, query), error: null };
  }

  @Post('budgets')
  @ApiOperation({ summary: 'Create budget' })
  async createBudget(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createBudget(tenantId, userId, data), error: null };
  }

  /* ─── Reimbursements ─────────────────────────────────────────────────── */
  @Get('reimbursements/summary')
  @ApiOperation({ summary: 'Reimbursement KPI summary' })
  async getReimbursementSummary(@Req() req: Request) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getReimbursementSummary(tenantId), error: null };
  }

  @Get('reimbursements')
  @ApiOperation({ summary: 'List reimbursements' })
  async getReimbursements(@Req() req: Request, @Query() query: any) {
    const { tenantId } = this.getUser(req);
    return { success: true, data: await this.service.getReimbursements(tenantId, query), error: null };
  }

  @Post('reimbursements')
  @ApiOperation({ summary: 'Create reimbursement claim' })
  async createReimbursement(@Req() req: Request, @Body() data: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.createReimbursement(tenantId, userId, data), error: null };
  }

  @Post('reimbursements/:id/approve')
  @ApiOperation({ summary: 'Approve reimbursement' })
  async approveReimbursement(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.approveReimbursement(id, tenantId, userId, body.reason), error: null };
  }

  @Post('reimbursements/:id/reject')
  @ApiOperation({ summary: 'Reject reimbursement' })
  async rejectReimbursement(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.rejectReimbursement(id, tenantId, userId, body.reason), error: null };
  }

  @Post('reimbursements/:id/mark-paid')
  @ApiOperation({ summary: 'Mark reimbursement as paid' })
  async markReimbursementPaid(@Req() req: Request, @Param('id') id: string) {
    const { tenantId, userId } = this.getUser(req);
    return { success: true, data: await this.service.markReimbursementPaid(id, tenantId, userId), error: null };
  }
}
