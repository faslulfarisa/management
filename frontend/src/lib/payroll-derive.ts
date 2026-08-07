import type { EmployeePayslip, PayslipComponent, EnrichedPayslipDetail } from '@/types/employee';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function shortMonth(month: number): string {
  return MONTHS[(month - 1 + 12) % 12];
}

export function fullMonth(month: number): string {
  return FULL_MONTHS[(month - 1 + 12) % 12];
}

export function periodLabel(month: number, year: number): string {
  return `${fullMonth(month)} ${year}`;
}

/** Friendlier wording for common payroll line-item labels. */
const LABEL_OVERRIDES: Record<string, string> = {
  basic: 'Basic Salary',
  hra: 'House Rent Allowance (HRA)',
  da: 'Dearness Allowance (DA)',
  conveyance: 'Conveyance Allowance',
  medical: 'Medical Allowance',
  'special allowance': 'Special Allowance',
  'pf employee': 'Provident Fund (PF)',
  pf: 'Provident Fund (PF)',
  'esi employee': 'Employee State Insurance (ESI)',
  esi: 'Employee State Insurance (ESI)',
  tds: 'Income Tax (TDS)',
  'professional tax': 'Professional Tax',
};

export function friendlyLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  return LABEL_OVERRIDES[normalized] ?? label;
}

const BONUS_PATTERN = /bonus|incentive/i;
const LEAVE_PATTERN = /leave/i;
const FINE_PATTERN = /fine|penalty/i;

export function sumByLabelPattern(items: Array<{ label: string; amount: number }> | undefined, pattern: RegExp): number {
  if (!items) return 0;
  return items.filter((i) => pattern.test(i.label)).reduce((sum, i) => sum + i.amount, 0);
}

export function getBonusAmount(detail?: EnrichedPayslipDetail | null, latest?: EmployeePayslip | null): number {
  if (detail) return sumByLabelPattern(detail.earnings, BONUS_PATTERN);
  return sumByComponentPattern(latest?.components, 'earning', BONUS_PATTERN);
}

export function getLeaveDeductionAmount(detail?: EnrichedPayslipDetail | null, latest?: EmployeePayslip | null): number {
  if (detail) return sumByLabelPattern(detail.deductions, LEAVE_PATTERN);
  return sumByComponentPattern(latest?.components, 'deduction', LEAVE_PATTERN);
}

function sumByComponentPattern(components: PayslipComponent[] | undefined, type: 'earning' | 'deduction', pattern: RegExp): number {
  if (!components) return 0;
  return components.filter((c) => c.type === type && pattern.test(c.label)).reduce((sum, c) => sum + c.amount, 0);
}

export const PAYROLL_PATTERNS = { BONUS_PATTERN, LEAVE_PATTERN, FINE_PATTERN };

/**
 * Estimates the next salary credit date based on the day-of-month of the most
 * recent payslip that was actually paid. Purely a client-side estimate for
 * display — clearly labelled as such in the UI.
 */
export function estimateNextPayDate(payslips: EmployeePayslip[]): Date | null {
  const lastPaid = payslips.find((p) => p.status === 'paid' && p.paid_at);
  if (!lastPaid?.paid_at) return null;

  const paidDate = new Date(lastPaid.paid_at);
  const day = paidDate.getDate();

  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) {
    next = new Date(now.getFullYear(), now.getMonth() + 1, day);
  }
  return next;
}
