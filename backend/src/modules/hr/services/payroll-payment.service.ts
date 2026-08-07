import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../../../shared/database.service';
import { BankAccountService } from './bank-account.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import {
  InitiatePaymentDto,
  BulkInitiatePaymentsDto,
  MarkManualPaidDto,
  RetryPaymentDto,
  ReversePaymentDto,
  PaymentMethod,
  BANK_REQUIRED_METHODS,
  RAZORPAY_GATEWAY_METHODS,
} from '../dto/payment.dto';
import { PAYROLL_PAYOUT_QUEUE, PAYROLL_PAYOUT_JOB, PayoutJobData } from '../queue/payroll-payout.types';
import { DEFAULT_CURRENCY } from '../../../shared/currency.constants';

@Injectable()
export class PayrollPaymentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly bankAccountService: BankAccountService,
    private readonly auditLog: AuditLogService,
    @InjectQueue(PAYROLL_PAYOUT_QUEUE) private readonly payoutQueue: Queue,
  ) {}

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async getPayslip(id: string, tenantId: string | null): Promise<any> {
    let sql = 'SELECT * FROM payslips WHERE id = $1';
    const params: any[] = [id];
    if (tenantId) { sql += ' AND tenant_id = $2'; params.push(tenantId); }
    const { rows } = await this.db.query(sql, params);
    if (!rows.length) throw new NotFoundException('Payslip not found');
    return rows[0];
  }

  private async getPaymentRow(id: string, tenantId: string | null): Promise<any> {
    let sql = `
      SELECT pp.*, e.first_name, e.last_name, e.employee_code
      FROM payroll_payments pp
      JOIN employees e ON pp.employee_id = e.id
      WHERE pp.id = $1
    `;
    const params: any[] = [id];
    if (tenantId) { sql += ' AND pp.tenant_id = $2'; params.push(tenantId); }
    const { rows } = await this.db.query(sql, params);
    if (!rows.length) throw new NotFoundException('Payment not found');
    return rows[0];
  }

  private async resolvePayrollRunId(tenantId: string, month: number, year: number): Promise<string | null> {
    const { rows } = await this.db.query(
      'SELECT id FROM payroll_runs WHERE tenant_id = $1 AND month = $2 AND year = $3 LIMIT 1',
      [tenantId, month, year],
    );
    return rows[0]?.id ?? null;
  }

  private async writeAudit(
    client: any,
    opts: {
      paymentId: string;
      tenantId: string;
      payslipId: string;
      employeeId: string;
      eventType: string;
      oldStatus?: string | null;
      newStatus?: string | null;
      actorId?: string;
      actorType?: 'user' | 'system' | 'webhook';
      metadata?: Record<string, any> | null;
      ipAddress?: string | null;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO payroll_payment_audit
         (payment_id, tenant_id, payslip_id, employee_id, event_type, old_status, new_status,
          actor_id, actor_type, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        opts.paymentId, opts.tenantId, opts.payslipId, opts.employeeId, opts.eventType,
        opts.oldStatus ?? null, opts.newStatus ?? null,
        opts.actorId ?? 'system', opts.actorType ?? 'user',
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        opts.ipAddress ?? null,
      ],
    );
  }

  private buildPayoutJob(payment: any, payslip: any): PayoutJobData {
    return {
      paymentId: payment.id,
      tenantId: payment.tenant_id,
      bankAccountId: payment.bank_account_id,
      amountInRupees: parseFloat(payment.amount),
      paymentMethod: payment.payment_method,
      narration: `Salary ${payslip.month}/${payslip.year}`,
    };
  }

  // ─── Initiate single payment ──────────────────────────────────────────────────

  async initiatePayment(
    payslipId: string,
    dto: InitiatePaymentDto,
    initiatedBy: string,
    tenantId: string | null,
    ipAddress?: string,
  ): Promise<any> {
    const payslip = await this.getPayslip(payslipId, tenantId);

    if (payslip.status === 'paid') {
      throw new ConflictException('Payslip is already paid');
    }

    const { rows: activePayments } = await this.db.query(
      `SELECT id, status FROM payroll_payments
       WHERE payslip_id = $1 AND status IN ('pending','processing') LIMIT 1`,
      [payslipId],
    );
    if (activePayments.length) {
      throw new ConflictException(
        `A ${activePayments[0].status} payment (${activePayments[0].id}) already exists for this payslip`,
      );
    }

    let bankAccountId: string | null = null;

    if (BANK_REQUIRED_METHODS.has(dto.payment_method)) {
      if (dto.bank_account_id) {
        const acct = await this.bankAccountService.findById(dto.bank_account_id, tenantId);
        bankAccountId = acct.id;
      } else {
        const primary = await this.bankAccountService.findPrimaryByEmployee(payslip.employee_id, tenantId);
        if (!primary) {
          throw new BadRequestException(
            'No primary bank account found for this employee. Add and designate a primary account before initiating a transfer.',
          );
        }
        bankAccountId = primary.id;
      }
    } else if (dto.payment_method === PaymentMethod.UPI) {
      if (dto.bank_account_id) {
        const acct = await this.bankAccountService.findById(dto.bank_account_id, tenantId);
        if (!acct.upi_id) throw new BadRequestException('The selected account has no UPI ID');
        bankAccountId = acct.id;
      }
    }

    const payrollRunId = await this.resolvePayrollRunId(payslip.tenant_id, payslip.month, payslip.year);
    const isRazorpay = RAZORPAY_GATEWAY_METHODS.has(dto.payment_method);
    const gateway = isRazorpay ? 'razorpay' : 'manual';

    const payment = await this.db.transaction(async (client) => {
      const { rows: [p] } = await client.query(
        `INSERT INTO payroll_payments
           (tenant_id, branch_id, payslip_id, payroll_run_id, employee_id, bank_account_id,
            amount, currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
            exchange_rate_source, exchange_rate_as_of, currency_snapshot,
            payment_method, payment_gateway, status, initiated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,'pending',$18)
         RETURNING *`,
        [
          payslip.tenant_id, payslip.branch_id ?? null, payslipId, payrollRunId,
          payslip.employee_id, bankAccountId, payslip.net_salary,
          payslip.currency || DEFAULT_CURRENCY.code, payslip.currency_symbol || DEFAULT_CURRENCY.symbol, payslip.exchange_rate ?? null,
          payslip.base_currency ?? payslip.currency ?? DEFAULT_CURRENCY.code,
          payslip.exchange_rate_to_base ?? payslip.exchange_rate ?? null,
          payslip.exchange_rate_source ?? 'payslip_snapshot',
          payslip.exchange_rate_as_of ?? new Date().toISOString(),
          JSON.stringify(payslip.currency_snapshot ?? {}),
          dto.payment_method, gateway, initiatedBy,
        ],
      );

      await client.query(
        'UPDATE payslips SET active_payment_id = $1, updated_at = now() WHERE id = $2',
        [p.id, payslipId],
      );

      await this.writeAudit(client, {
        paymentId: p.id, tenantId: payslip.tenant_id, payslipId,
        employeeId: payslip.employee_id,
        eventType: 'initiated', newStatus: 'pending',
        actorId: initiatedBy, actorType: 'user',
        metadata: { payment_method: dto.payment_method, gateway, notes: dto.notes ?? null },
        ipAddress,
      });

      return p;
    });

    if (isRazorpay && bankAccountId) {
      await this.payoutQueue.add(PAYROLL_PAYOUT_JOB, this.buildPayoutJob(payment, payslip), {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      });
    }

    return payment;
  }

  // ─── Bulk initiate ────────────────────────────────────────────────────────────

  async bulkInitiatePayments(
    payrollRunId: string,
    dto: BulkInitiatePaymentsDto,
    initiatedBy: string,
    tenantId: string | null,
    ipAddress?: string,
  ): Promise<{ initiated: any[]; skipped: any[]; failed: any[] }> {
    let runSql = 'SELECT * FROM payroll_runs WHERE id = $1';
    const runParams: any[] = [payrollRunId];
    if (tenantId) { runSql += ' AND tenant_id = $2'; runParams.push(tenantId); }
    const { rows: runs } = await this.db.query(runSql, runParams);
    if (!runs.length) throw new NotFoundException('Payroll run not found');
    const run = runs[0];

    let slipSql = `
      SELECT p.*, e.first_name, e.last_name, e.employee_code,
             eba.id        AS primary_bank_id,
             eba.upi_id    AS bank_upi_id,
             eba.verification_status AS bank_verification_status
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN employee_bank_accounts eba
        ON eba.employee_id = p.employee_id AND eba.is_primary = TRUE AND eba.deleted_at IS NULL
      WHERE p.tenant_id = $1
        AND p.month = $2 AND p.year = $3
        AND p.status NOT IN ('paid')
    `;
    const slipParams: any[] = [run.tenant_id, run.month, run.year];

    if (dto.payslip_ids?.length) {
      slipSql += ` AND p.id = ANY($4::uuid[])`;
      slipParams.push(`{${dto.payslip_ids.join(',')}}`);
    }

    const { rows: payslips } = await this.db.query(slipSql, slipParams);

    const initiated: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];
    const isRazorpay = RAZORPAY_GATEWAY_METHODS.has(dto.payment_method);
    const gateway = isRazorpay ? 'razorpay' : 'manual';

    for (const payslip of payslips) {
      try {
        const { rows: active } = await this.db.query(
          `SELECT id FROM payroll_payments WHERE payslip_id = $1 AND status IN ('pending','processing') LIMIT 1`,
          [payslip.id],
        );
        if (active.length) {
          skipped.push({ payslip_id: payslip.id, reason: 'active_payment_exists', payment_id: active[0].id });
          continue;
        }

        if (BANK_REQUIRED_METHODS.has(dto.payment_method) && !payslip.primary_bank_id) {
          const reason = 'no_primary_bank_account';
          if (dto.skip_invalid) { skipped.push({ payslip_id: payslip.id, reason }); continue; }
          failed.push({ payslip_id: payslip.id, reason });
          continue;
        }

        if (dto.payment_method === PaymentMethod.UPI && !payslip.bank_upi_id) {
          const reason = 'no_upi_id';
          if (dto.skip_invalid) { skipped.push({ payslip_id: payslip.id, reason }); continue; }
          failed.push({ payslip_id: payslip.id, reason });
          continue;
        }

        const bankAccountId: string | null = payslip.primary_bank_id ?? null;

        const payment = await this.db.transaction(async (client) => {
          const { rows: [p] } = await client.query(
            `INSERT INTO payroll_payments
               (tenant_id, branch_id, payslip_id, payroll_run_id, employee_id, bank_account_id,
                amount, currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
                exchange_rate_source, exchange_rate_as_of, currency_snapshot,
                payment_method, payment_gateway, status, initiated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,'pending',$18)
             RETURNING *`,
            [
              run.tenant_id, payslip.branch_id ?? null, payslip.id, payrollRunId,
              payslip.employee_id, bankAccountId, payslip.net_salary,
              payslip.currency || run.currency || DEFAULT_CURRENCY.code,
              payslip.currency_symbol || run.currency_symbol || DEFAULT_CURRENCY.symbol,
              payslip.exchange_rate ?? run.exchange_rate ?? null,
              payslip.base_currency ?? run.base_currency ?? payslip.currency ?? run.currency ?? DEFAULT_CURRENCY.code,
              payslip.exchange_rate_to_base ?? run.exchange_rate_to_base ?? payslip.exchange_rate ?? run.exchange_rate ?? null,
              payslip.exchange_rate_source ?? run.exchange_rate_source ?? 'payslip_snapshot',
              payslip.exchange_rate_as_of ?? run.exchange_rate_as_of ?? new Date().toISOString(),
              JSON.stringify(payslip.currency_snapshot ?? run.currency_snapshot ?? {}),
              dto.payment_method, gateway, initiatedBy,
            ],
          );

          await client.query(
            'UPDATE payslips SET active_payment_id = $1, updated_at = now() WHERE id = $2',
            [p.id, payslip.id],
          );

          await this.writeAudit(client, {
            paymentId: p.id, tenantId: run.tenant_id, payslipId: payslip.id,
            employeeId: payslip.employee_id,
            eventType: 'initiated', newStatus: 'pending',
            actorId: initiatedBy, actorType: 'user',
            metadata: { payment_method: dto.payment_method, gateway, bulk: true },
            ipAddress,
          });

          return p;
        });

        if (isRazorpay && bankAccountId) {
          await this.payoutQueue.add(PAYROLL_PAYOUT_JOB, this.buildPayoutJob(payment, payslip), {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
          });
        }

        initiated.push(payment);
      } catch (err: any) {
        failed.push({ payslip_id: payslip.id, reason: err?.message ?? 'unknown_error' });
      }
    }

    return { initiated, skipped, failed };
  }

  // ─── Mark manual paid ─────────────────────────────────────────────────────────

  async markManualPaid(
    paymentId: string,
    dto: MarkManualPaidDto,
    updatedBy: string,
    tenantId: string | null,
    ipAddress?: string,
  ): Promise<any> {
    const payment = await this.getPaymentRow(paymentId, tenantId);

    if (!['pending', 'processing'].includes(payment.status)) {
      throw new BadRequestException(
        `Cannot confirm payment — current status is '${payment.status}'. Only pending or processing payments can be confirmed.`,
      );
    }
    if (payment.payment_gateway === 'razorpay') {
      throw new BadRequestException('Razorpay payments are confirmed via webhook, not manually.');
    }

    const transactionReference = dto.transaction_reference?.trim() || null;
    if (payment.payment_method !== PaymentMethod.CASH && !transactionReference) {
      throw new BadRequestException('Transaction reference is required for this payment method.');
    }

    return this.db.transaction(async (client) => {
      const { rows: [updated] } = await client.query(
        `UPDATE payroll_payments
         SET status = 'paid',
             transaction_reference = $1,
             payment_date = $2::date,
             processed_at = now(),
             updated_at = now()
         WHERE id = $3 RETURNING *`,
        [transactionReference, dto.payment_date, paymentId],
      );

      await client.query(
        `UPDATE payslips SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
        [payment.payslip_id],
      );

      await this.writeAudit(client, {
        paymentId, tenantId: payment.tenant_id, payslipId: payment.payslip_id,
        employeeId: payment.employee_id,
        eventType: 'paid', oldStatus: payment.status, newStatus: 'paid',
        actorId: updatedBy, actorType: 'user',
        metadata: {
          transaction_reference: transactionReference,
          payment_date: dto.payment_date,
          notes: dto.notes ?? null,
        },
        ipAddress,
      });

      try {
        await this.auditLog.log({
          tenantId: payment.tenant_id, userId: updatedBy,
          entityType: 'payroll_payment', entityId: paymentId,
          action: 'payment_confirmed',
          oldValues: { status: payment.status },
          newValues: { status: 'paid', transaction_reference: transactionReference },
          ipAddress,
        });
      } catch {}

      return updated;
    });
  }

  // ─── Retry failed payment ─────────────────────────────────────────────────────

  async retryPayment(
    paymentId: string,
    dto: RetryPaymentDto,
    initiatedBy: string,
    tenantId: string | null,
    ipAddress?: string,
  ): Promise<any> {
    const original = await this.getPaymentRow(paymentId, tenantId);

    if (!['failed', 'cancelled'].includes(original.status)) {
      throw new BadRequestException(
        `Cannot retry payment with status '${original.status}'. Only failed or cancelled payments can be retried.`,
      );
    }

    const { rows: active } = await this.db.query(
      `SELECT id FROM payroll_payments
       WHERE payslip_id = $1 AND status IN ('pending','processing') AND id != $2 LIMIT 1`,
      [original.payslip_id, paymentId],
    );
    if (active.length) {
      throw new ConflictException(`An active payment (${active[0].id}) already exists for this payslip`);
    }

    let bankAccountId: string = original.bank_account_id ?? null;
    if (dto.bank_account_id) {
      const acct = await this.bankAccountService.findById(dto.bank_account_id, tenantId);
      bankAccountId = acct.id;
    }

    const rootParentId: string = original.parent_payment_id ?? paymentId;

    const payment = await this.db.transaction(async (client) => {
      const { rows: [p] } = await client.query(
        `INSERT INTO payroll_payments
           (tenant_id, branch_id, payslip_id, payroll_run_id, employee_id, bank_account_id,
            amount, currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
            exchange_rate_source, exchange_rate_as_of, currency_snapshot,
            payment_method, payment_gateway, status, retry_count, parent_payment_id, initiated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,'pending',$18,$19,$20)
         RETURNING *`,
        [
          original.tenant_id, original.branch_id, original.payslip_id, original.payroll_run_id,
          original.employee_id, bankAccountId, original.amount,
          original.currency || DEFAULT_CURRENCY.code, original.currency_symbol || DEFAULT_CURRENCY.symbol, original.exchange_rate ?? null,
          original.base_currency ?? original.currency ?? DEFAULT_CURRENCY.code,
          original.exchange_rate_to_base ?? original.exchange_rate ?? null,
          original.exchange_rate_source ?? 'payment_retry',
          original.exchange_rate_as_of ?? new Date().toISOString(),
          JSON.stringify(original.currency_snapshot ?? {}),
          original.payment_method, original.payment_gateway ?? 'manual',
          original.retry_count + 1, rootParentId, initiatedBy,
        ],
      );

      await client.query(
        'UPDATE payslips SET active_payment_id = $1, updated_at = now() WHERE id = $2',
        [p.id, original.payslip_id],
      );

      await this.writeAudit(client, {
        paymentId: original.id, tenantId: original.tenant_id, payslipId: original.payslip_id,
        employeeId: original.employee_id,
        eventType: 'retry', oldStatus: original.status, newStatus: original.status,
        actorId: initiatedBy, actorType: 'user', metadata: { retried_as: p.id }, ipAddress,
      });

      await this.writeAudit(client, {
        paymentId: p.id, tenantId: original.tenant_id, payslipId: original.payslip_id,
        employeeId: original.employee_id,
        eventType: 'initiated', newStatus: 'pending',
        actorId: initiatedBy, actorType: 'user',
        metadata: {
          is_retry: true, retry_count: p.retry_count,
          parent_payment_id: rootParentId, notes: dto.notes ?? null,
        },
        ipAddress,
      });

      try {
        await this.auditLog.log({
          tenantId: original.tenant_id, userId: initiatedBy,
          entityType: 'payroll_payment', entityId: p.id,
          action: 'payment_retry_initiated',
          newValues: { retry_count: p.retry_count, parent_payment_id: rootParentId },
          ipAddress,
        });
      } catch {}

      return p;
    });

    // Re-enqueue Razorpay job for the new retry payment
    if (payment.payment_gateway === 'razorpay' && payment.bank_account_id) {
      const payslip = await this.getPayslip(payment.payslip_id, tenantId);
      await this.payoutQueue.add(PAYROLL_PAYOUT_JOB, this.buildPayoutJob(payment, payslip), {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      });
    }

    return payment;
  }

  // ─── Reverse paid payment ─────────────────────────────────────────────────────

  async reversePayment(
    paymentId: string,
    dto: ReversePaymentDto,
    updatedBy: string,
    tenantId: string | null,
    ipAddress?: string,
  ): Promise<any> {
    const payment = await this.getPaymentRow(paymentId, tenantId);

    if (payment.status !== 'paid') {
      throw new BadRequestException(
        `Cannot reverse payment with status '${payment.status}'. Only paid payments can be reversed.`,
      );
    }

    return this.db.transaction(async (client) => {
      const { rows: [updated] } = await client.query(
        `UPDATE payroll_payments SET status = 'reversed', updated_at = now() WHERE id = $1 RETURNING *`,
        [paymentId],
      );

      await client.query(
        `UPDATE payslips
         SET status = 'processed', paid_at = NULL, active_payment_id = NULL, updated_at = now()
         WHERE id = $1`,
        [payment.payslip_id],
      );

      await this.writeAudit(client, {
        paymentId, tenantId: payment.tenant_id, payslipId: payment.payslip_id,
        employeeId: payment.employee_id,
        eventType: 'reversed', oldStatus: 'paid', newStatus: 'reversed',
        actorId: updatedBy, actorType: 'user', metadata: { reason: dto.reason }, ipAddress,
      });

      try {
        await this.auditLog.log({
          tenantId: payment.tenant_id, userId: updatedBy,
          entityType: 'payroll_payment', entityId: paymentId,
          action: 'payment_reversed',
          oldValues: { status: 'paid' },
          newValues: { status: 'reversed', reason: dto.reason },
          ipAddress,
        });
      } catch {}

      return updated;
    });
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────

  async getPaymentById(id: string, tenantId: string | null): Promise<any> {
    return this.getPaymentRow(id, tenantId);
  }

  async getPaymentsByPayslip(payslipId: string, tenantId: string | null): Promise<any[]> {
    let sql = `
      SELECT pp.*, e.first_name, e.last_name, e.employee_code
      FROM payroll_payments pp
      JOIN employees e ON pp.employee_id = e.id
      WHERE pp.payslip_id = $1
    `;
    const params: any[] = [payslipId];
    if (tenantId) { sql += ' AND pp.tenant_id = $2'; params.push(tenantId); }
    sql += ' ORDER BY pp.created_at DESC';
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  async getPaymentsByRun(payrollRunId: string, tenantId: string | null): Promise<any[]> {
    let sql = `
      SELECT pp.*, e.first_name, e.last_name, e.employee_code
      FROM payroll_payments pp
      JOIN employees e ON pp.employee_id = e.id
      WHERE pp.payroll_run_id = $1
    `;
    const params: any[] = [payrollRunId];
    if (tenantId) { sql += ' AND pp.tenant_id = $2'; params.push(tenantId); }
    sql += ' ORDER BY pp.created_at DESC';
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  // ─── Gateway webhook event handler ───────────────────────────────────────────

  async handleGatewayEvent(
    gatewayPayoutId: string,
    newStatus: 'processing' | 'paid' | 'failed' | 'reversed',
    metadata: Record<string, any>,
  ): Promise<void> {
    const { rows } = await this.db.query(
      `SELECT * FROM payroll_payments WHERE gateway_payout_id = $1 LIMIT 1`,
      [gatewayPayoutId],
    );
    if (!rows.length) return; // Unknown payout — webhook for a different system or test event

    const payment = rows[0];
    if (payment.status === newStatus) return; // Idempotent — already in target state

    await this.db.transaction(async (client) => {
      const sets: string[] = ['status = $1', 'updated_at = now()'];
      const params: any[] = [newStatus];

      if (newStatus === 'paid') sets.push(`processed_at = now()`);
      if (newStatus === 'failed') {
        sets.push(`failed_at = now()`);
        if (metadata.description) {
          sets.push(`failure_reason = $${params.length + 1}`);
          params.push(String(metadata.description).slice(0, 500));
        }
      }
      if (metadata.gateway_response) {
        sets.push(`gateway_response = $${params.length + 1}::jsonb`);
        params.push(JSON.stringify(metadata.gateway_response));
      }

      params.push(payment.id);
      await client.query(
        `UPDATE payroll_payments SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );

      if (newStatus === 'paid') {
        await client.query(
          `UPDATE payslips SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
          [payment.payslip_id],
        );
      }

      if (newStatus === 'reversed') {
        await client.query(
          `UPDATE payslips
           SET status = 'processed', paid_at = NULL, active_payment_id = NULL, updated_at = now()
           WHERE id = $1`,
          [payment.payslip_id],
        );
      }

      await this.writeAudit(client, {
        paymentId: payment.id,
        tenantId: payment.tenant_id,
        payslipId: payment.payslip_id,
        employeeId: payment.employee_id,
        eventType: 'webhook_received',
        oldStatus: payment.status,
        newStatus,
        actorId: 'razorpay',
        actorType: 'webhook',
        metadata,
      });
    });
  }

  // ─── Backward-compat delegate for PayrollService.markPaid ────────────────────

  async markPaidLegacy(payslipId: string, tenantId: string | null, userId: string): Promise<any> {
    const payslip = await this.getPayslip(payslipId, tenantId);
    if (payslip.status === 'paid') return payslip;

    const payrollRunId = await this.resolvePayrollRunId(payslip.tenant_id, payslip.month, payslip.year);

    return this.db.transaction(async (client) => {
      const { rows: [payment] } = await client.query(
        `INSERT INTO payroll_payments
           (tenant_id, branch_id, payslip_id, payroll_run_id, employee_id, amount,
            currency, currency_symbol, exchange_rate, base_currency, exchange_rate_to_base,
            exchange_rate_source, exchange_rate_as_of, currency_snapshot,
            payment_method, payment_gateway, status, initiated_by, initiated_at, processed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'cash','manual','paid',$16,now(),now())
         RETURNING *`,
        [
          payslip.tenant_id, payslip.branch_id ?? null, payslipId, payrollRunId,
          payslip.employee_id, payslip.net_salary,
          payslip.currency || DEFAULT_CURRENCY.code, payslip.currency_symbol || DEFAULT_CURRENCY.symbol, payslip.exchange_rate ?? null,
          payslip.base_currency ?? payslip.currency ?? DEFAULT_CURRENCY.code,
          payslip.exchange_rate_to_base ?? payslip.exchange_rate ?? null,
          payslip.exchange_rate_source ?? 'payslip_snapshot',
          payslip.exchange_rate_as_of ?? new Date().toISOString(),
          JSON.stringify(payslip.currency_snapshot ?? {}),
          userId,
        ],
      );

      const { rows: [updated] } = await client.query(
        `UPDATE payslips
         SET status = 'paid', paid_at = now(), active_payment_id = $1, updated_at = now()
         WHERE id = $2 RETURNING *`,
        [payment.id, payslipId],
      );

      await this.writeAudit(client, {
        paymentId: payment.id, tenantId: payslip.tenant_id, payslipId,
        employeeId: payslip.employee_id,
        eventType: 'paid', newStatus: 'paid',
        actorId: userId, actorType: 'user',
        metadata: { source: 'legacy_mark_paid' },
      });

      return updated;
    });
  }
}
