import { cn } from '@/lib/utils';
import { getPayrollStatus, type PayrollStatusInfo } from '@/lib/payroll-status';

interface PayrollStatusChipProps {
  payslip?: { status: 'draft' | 'processed' | 'paid' } | null;
  payment?: { status: string; payment_date?: string | null } | null;
  status?: PayrollStatusInfo;
  className?: string;
}

export function PayrollStatusChip({ payslip, payment, status, className }: PayrollStatusChipProps) {
  const info = status ?? getPayrollStatus(payslip, payment);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
        info.bg,
        info.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', info.dot)} />
      {info.label}
    </span>
  );
}
