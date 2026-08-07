import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PayslipService } from '../services/payslip.service';
import { DatabaseService } from '../../../shared/database.service';

@ApiTags('Payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('payslips')
export class PayslipController {
  private readonly logger = new Logger(PayslipController.name);

  constructor(
    private readonly payslipService: PayslipService,
    private readonly db: DatabaseService,
  ) {}

  // ── Static-prefix routes MUST come before /:id ───────────────────────────

  @Get('employee/:employee_id')
  @ApiOperation({ summary: 'List all processed/paid payslips for a specific employee (admin)' })
  @ApiParam({ name: 'employee_id', description: 'Employee UUID' })
  @ApiQuery({ name: 'year',  required: false, type: Number })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEmployeePayslips(
    @Req() req: Request,
    @Param('employee_id') employeeId: string,
    @Query() query: { year?: string; page?: string; limit?: string },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.payslipService.listEmployeePayslips(tenantId, employeeId, {
      year:  query.year  ? parseInt(query.year,  10) : undefined,
      page:  query.page  ? parseInt(query.page,  10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result, error: null };
  }

  @Get('run/:run_id')
  @ApiOperation({ summary: 'List payslips in a payroll run with snapshot status (admin)' })
  @ApiParam({ name: 'run_id', description: 'Payroll run UUID' })
  async getRunPayslips(@Req() req: Request, @Param('run_id') runId: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;

    const { rows } = await this.db.query(
      `SELECT p.id, p.payslip_number, p.month, p.year,
              p.gross_salary, p.total_deductions, p.net_salary, p.status,
              p.paid_at,
              (p.snapshot_data IS NOT NULL) AS has_snapshot,
              e.first_name, e.last_name, e.employee_code
       FROM payslips p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.payroll_run_id = $1 AND p.tenant_id = $2
       ORDER BY e.last_name ASC, e.first_name ASC`,
      [runId, tenantId],
    );

    return {
      success: true,
      data: rows.map(r => ({
        ...r,
        gross_salary:     parseFloat(r.gross_salary),
        total_deductions: parseFloat(r.total_deductions),
        net_salary:       parseFloat(r.net_salary),
        paid_at:          r.paid_at ? new Date(r.paid_at).toISOString() : null,
      })),
      error: null,
    };
  }

  @Post('run/:run_id/snapshots')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate snapshots for all processed payslips in a run that lack one (idempotent)',
  })
  @ApiParam({ name: 'run_id', description: 'Payroll run UUID' })
  async backfillSnapshots(@Req() req: Request, @Param('run_id') runId: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;

    const { rows: pending } = await this.db.query(
      `SELECT id, tenant_id FROM payslips
       WHERE payroll_run_id = $1
         AND tenant_id = $2
         AND status IN ('processed', 'paid')
         AND snapshot_data IS NULL`,
      [runId, tenantId],
    );

    let snapshotted = 0;
    const failed: string[] = [];

    for (const ps of pending) {
      try {
        await this.payslipService.takeSnapshot(ps.id, ps.tenant_id, user.sub);
        snapshotted++;
      } catch (err) {
        this.logger.error(`Backfill snapshot failed for payslip ${ps.id}: ${err.message}`);
        failed.push(ps.id);
      }
    }

    const { rows: totalRows } = await this.db.query(
      `SELECT COUNT(*) AS cnt FROM payslips
       WHERE payroll_run_id = $1 AND tenant_id = $2
         AND status IN ('processed', 'paid')`,
      [runId, tenantId],
    );
    const total = parseInt(totalRows[0]?.cnt ?? '0', 10);
    const already_done = total - pending.length;

    return {
      success: true,
      data: { total, snapshotted, already_done, failed },
      error: null,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fully enriched payslip detail (admin)' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  async getPayslipDetail(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;

    const detail = await this.payslipService.getPayslipDetail(tenantId, id, {
      actorId:   user.sub,
      actorType: 'admin',
      ipAddress: (req as any).ip,
    });

    return { success: true, data: detail, error: null };
  }

  @Post(':id/log-access')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a download or print event for a payslip' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  async logAccess(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { action?: 'view' | 'download' | 'print' },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;

    this.payslipService
      .logAccess(id, tenantId, user.sub, 'admin', body.action ?? 'download', {
        ipAddress: (req as any).ip,
      })
      .catch(() => {});

    return { success: true, data: null, error: null };
  }
}
