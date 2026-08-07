export type PayrollStatusKey = 'processing' | 'approved' | 'scheduled' | 'paid' | 'failed' | 'on_hold';

export interface PayrollStatusInfo {
  key: PayrollStatusKey;
  label: string;
  description: string;
  bg: string;
  text: string;
  dot: string;
}

const STATUS_INFO: Record<PayrollStatusKey, Omit<PayrollStatusInfo, 'key'>> = {
  processing: {
    label: 'Processing',
    description: 'Your salary for this period is being calculated.',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  approved: {
    label: 'Approved',
    description: 'Your payslip has been finalized and is awaiting payment.',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  scheduled: {
    label: 'Scheduled',
    description: 'Your salary payment has been scheduled.',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  paid: {
    label: 'Paid',
    description: 'Your salary has been credited.',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    description: 'There was an issue crediting your salary. Please contact HR.',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  on_hold: {
    label: 'On Hold',
    description: 'Your salary payment is currently on hold.',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
};

interface PayslipLike {
  status: 'draft' | 'processed' | 'paid';
}

interface PaymentLike {
  status: string;
  payment_date?: string | null;
}

/**
 * Maps the payslip + payment records (draft/processed/paid + gateway payment status)
 * onto the 6 employee-facing payroll states without changing any backend data shapes.
 */
export function getPayrollStatus(
  payslip: PayslipLike | null | undefined,
  payment?: PaymentLike | null,
): PayrollStatusInfo {
  let key: PayrollStatusKey;

  if (!payslip) {
    key = 'processing';
  } else if (payment?.status === 'failed') {
    key = 'failed';
  } else if (payment?.status === 'cancelled' || payment?.status === 'reversed') {
    key = 'on_hold';
  } else if (payslip.status === 'paid' && (payment?.status === 'paid' || !payment)) {
    key = 'paid';
  } else if (payment?.status === 'processing') {
    key = 'scheduled';
  } else if (payslip.status === 'processed') {
    key = 'approved';
  } else {
    key = 'processing';
  }

  return { key, ...STATUS_INFO[key] };
}
