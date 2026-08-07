export const PAYROLL_PAYOUT_QUEUE = 'payroll-payout';
export const PAYROLL_PAYOUT_JOB = 'process-payout';

/** Maps PaymentMethod enum values to Razorpay payout modes */
export const RAZORPAY_MODE_MAP: Record<string, string> = {
  razorpay: 'NEFT',
  neft: 'NEFT',
  rtgs: 'RTGS',
  imps: 'IMPS',
  upi: 'UPI',
  bank_transfer: 'NEFT',
};

export interface PayoutJobData {
  paymentId: string;
  tenantId: string;
  bankAccountId: string;
  /** Net salary in INR (rupees) */
  amountInRupees: number;
  paymentMethod: string;
  narration: string;
  correlationId?: string;
}
