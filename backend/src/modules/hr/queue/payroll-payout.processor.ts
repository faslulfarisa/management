import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DatabaseService } from '../../../shared/database.service';
import { BankAccountService } from '../services/bank-account.service';
import { RazorpayGatewayService } from '../gateways/razorpay-gateway.service';
import {
  PAYROLL_PAYOUT_QUEUE,
  PAYROLL_PAYOUT_JOB,
  RAZORPAY_MODE_MAP,
  PayoutJobData,
} from './payroll-payout.types';

@Processor(PAYROLL_PAYOUT_QUEUE)
export class PayrollPayoutProcessor {
  private readonly logger = new Logger(PayrollPayoutProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly bankAccountService: BankAccountService,
    private readonly gateway: RazorpayGatewayService,
  ) {}

  @Process({ name: PAYROLL_PAYOUT_JOB, concurrency: 3 })
  async handlePayout(job: Job<PayoutJobData>): Promise<void> {
    const { paymentId, tenantId, bankAccountId, amountInRupees, paymentMethod, narration } = job.data;

    this.logger.log(JSON.stringify({
      event: 'payout_job_started', paymentId, attempt: job.attemptsMade + 1,
    }));

    // Re-fetch payment — skip if no longer pending (idempotency guard)
    const { rows: [payment] } = await this.db.query(
      `SELECT * FROM payroll_payments WHERE id = $1 AND status = 'pending'`,
      [paymentId],
    );
    if (!payment) {
      this.logger.warn(`Payment ${paymentId} is no longer pending — skipping job`);
      return;
    }

    // Resolve Razorpay contact + fund account (creates lazily, caches IDs)
    const bankAccount = await this.bankAccountService.findByIdDecrypted(bankAccountId, tenantId);
    const { fundAccountId } = await this.gateway.ensureContactAndFundAccount(bankAccount);

    // Submit payout to Razorpay
    const mode = RAZORPAY_MODE_MAP[paymentMethod] ?? 'NEFT';
    const result = await this.gateway.createPayout({
      fundAccountId,
      amountInRupees,
      mode,
      referenceId: paymentId,
      narration,
    });

    // Update payment to 'processing' (or 'paid' if Razorpay immediately confirmed)
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE payroll_payments
         SET status = $1,
             gateway_payout_id = $2,
             gateway_fund_account_id = $3,
             gateway_response = $4::jsonb,
             processed_at = now(),
             updated_at = now()
         WHERE id = $5`,
        [result.status, result.gatewayPayoutId, result.gatewayFundAccountId,
         JSON.stringify(result.rawResponse), paymentId],
      );

      // If Razorpay immediately confirmed as paid, update payslip too
      if (result.status === 'paid') {
        await client.query(
          `UPDATE payslips SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`,
          [payment.payslip_id],
        );
      }

      await client.query(
        `INSERT INTO payroll_payment_audit
           (payment_id, tenant_id, payslip_id, event_type, old_status, new_status,
            actor_id, actor_type, metadata)
         VALUES ($1,$2,$3,$4,'pending',$5,'razorpay','system',$6::jsonb)`,
        [
          paymentId, tenantId, payment.payslip_id,
          result.status === 'paid' ? 'paid' : 'processing',
          result.status,
          JSON.stringify({ gateway_payout_id: result.gatewayPayoutId, mode }),
        ],
      );
    });

    this.logger.log(JSON.stringify({
      event: 'payout_job_completed', paymentId,
      gatewayPayoutId: result.gatewayPayoutId, status: result.status,
    }));
  }

  @OnQueueFailed()
  async onFailed(job: Job<PayoutJobData>, error: Error): Promise<void> {
    const { paymentId, tenantId } = job.data;
    const maxAttempts = job.opts.attempts ?? 3;
    const isFinal = job.attemptsMade >= maxAttempts;

    this.logger.error(JSON.stringify({
      event: 'payout_job_failed', paymentId,
      attempt: job.attemptsMade, maxAttempts, isFinal,
      error: error.message,
    }));

    if (!isFinal) return;

    // All retries exhausted — mark payment as failed in the DB
    try {
      const { rows: [payment] } = await this.db.query(
        `SELECT payslip_id FROM payroll_payments WHERE id = $1`,
        [paymentId],
      );
      if (!payment) return;

      await this.db.transaction(async (client) => {
        await client.query(
          `UPDATE payroll_payments
           SET status = 'failed', failure_reason = $1, failed_at = now(), updated_at = now()
           WHERE id = $2`,
          [error.message.slice(0, 500), paymentId],
        );

        await client.query(
          `INSERT INTO payroll_payment_audit
             (payment_id, tenant_id, payslip_id, event_type, old_status, new_status,
              actor_id, actor_type, metadata)
           VALUES ($1,$2,$3,'failed','pending','failed','razorpay','system',$4::jsonb)`,
          [
            paymentId, tenantId, payment.payslip_id,
            JSON.stringify({ error: error.message, attempts: job.attemptsMade }),
          ],
        );
      });
    } catch (dbErr: any) {
      this.logger.error(`Failed to mark payment ${paymentId} as failed: ${dbErr.message}`);
    }
  }
}
