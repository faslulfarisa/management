export interface GatewayContactFundResult {
  contactId: string;
  fundAccountId: string;
}

export interface GatewayPayoutResult {
  gatewayPayoutId: string;
  gatewayFundAccountId: string;
  /** 'processing' means the payout was accepted by the gateway; 'paid' means instantly confirmed */
  status: 'processing' | 'paid';
  rawResponse: Record<string, any>;
}

export interface CreatePayoutOpts {
  fundAccountId: string;
  /** Net salary amount in INR (rupees, not paise) */
  amountInRupees: number;
  mode: string;
  /** Our internal payroll_payments.id — used as idempotency key */
  referenceId: string;
  narration: string;
}

export interface PaymentGatewayInterface {
  readonly name: 'razorpay' | 'manual';
  ensureContactAndFundAccount(bankAccount: DecryptedBankAccountRow): Promise<GatewayContactFundResult>;
  createPayout(opts: CreatePayoutOpts): Promise<GatewayPayoutResult>;
}

/** Shape returned by BankAccountService.findByIdDecrypted — replicated here to avoid cross-module coupling */
export interface DecryptedBankAccountRow {
  id: string;
  employee_id: string;
  tenant_id: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_type: string;
  upi_id: string | null;
  account_holder_name?: string;
  razorpay_fund_account_id: string | null;
  razorpay_contact_id: string | null;
}
