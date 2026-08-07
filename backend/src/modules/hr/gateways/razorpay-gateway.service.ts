import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { BankAccountService } from '../services/bank-account.service';
import {
  PaymentGatewayInterface,
  GatewayContactFundResult,
  GatewayPayoutResult,
  CreatePayoutOpts,
  DecryptedBankAccountRow,
} from './payment-gateway.interface';

@Injectable()
export class RazorpayGatewayService implements PaymentGatewayInterface {
  readonly name = 'razorpay' as const;
  private _client: Razorpay | null = null;
  private readonly logger = new Logger(RazorpayGatewayService.name);

  constructor(private readonly bankAccountService: BankAccountService) {}

  private get client(): Razorpay {
    if (!this._client) {
      const key_id = process.env.RAZORPAY_KEY_ID;
      if (!key_id) throw new Error('RAZORPAY_KEY_ID env var is not configured');
      this._client = new Razorpay({
        key_id,
        key_secret: process.env.RAZORPAY_KEY_SECRET ?? '',
      });
    }
    return this._client;
  }

  // ─── Contact + Fund Account lifecycle ────────────────────────────────────────

  async ensureContactAndFundAccount(
    bankAccount: DecryptedBankAccountRow,
  ): Promise<GatewayContactFundResult> {
    // Reuse cached IDs when both are already stored
    if (bankAccount.razorpay_contact_id && bankAccount.razorpay_fund_account_id) {
      return {
        contactId: bankAccount.razorpay_contact_id,
        fundAccountId: bankAccount.razorpay_fund_account_id,
      };
    }

    // Step 1 — create contact if missing
    let contactId = bankAccount.razorpay_contact_id;
    if (!contactId) {
      const res = await (this.client as any).api.rq.post('/v1/contacts', {
        name: bankAccount.account_holder_name ?? bankAccount.bank_name,
        type: 'employee',
      });
      contactId = res.data.id;
      this.logger.debug(`Created Razorpay contact ${contactId} for bank account ${bankAccount.id}`);
    }

    // Step 2 — create fund account if missing
    let fundAccountId = bankAccount.razorpay_fund_account_id;
    if (!fundAccountId) {
      const fa = await this.client.fundAccount.create({
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: bankAccount.account_holder_name ?? bankAccount.bank_name,
          ifsc: bankAccount.ifsc_code,
          account_number: bankAccount.account_number,
        },
      } as any);
      fundAccountId = (fa as any).id;
      this.logger.debug(`Created Razorpay fund account ${fundAccountId} for bank account ${bankAccount.id}`);
    }

    // Persist both IDs so the next call is a no-op
    await this.bankAccountService.updateRazorpayIds(bankAccount.id, contactId!, fundAccountId!);

    return { contactId: contactId!, fundAccountId: fundAccountId! };
  }

  // ─── Payout creation ─────────────────────────────────────────────────────────

  async createPayout(opts: CreatePayoutOpts): Promise<GatewayPayoutResult> {
    const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;
    if (!accountNumber) {
      throw new Error('RAZORPAY_ACCOUNT_NUMBER env var is not configured');
    }

    const amountInPaise = Math.round(opts.amountInRupees * 100);
    const narration = opts.narration.slice(0, 30); // Razorpay narration limit

    const res = await (this.client as any).api.rq.post('/v1/payouts', {
      account_number: accountNumber,
      fund_account_id: opts.fundAccountId,
      amount: amountInPaise,
      currency: 'INR',
      mode: opts.mode,
      purpose: 'salary',
      queue_if_low_balance: true,
      narration,
      reference_id: opts.referenceId,
    });

    const payout = res.data;
    this.logger.log(`Razorpay payout ${payout.id} created for payment ${opts.referenceId} — status: ${payout.status}`);

    return {
      gatewayPayoutId: payout.id,
      gatewayFundAccountId: opts.fundAccountId,
      status: payout.status === 'processed' ? 'paid' : 'processing',
      rawResponse: payout,
    };
  }
}
