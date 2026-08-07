'use client';

import { format } from 'date-fns';
import { Landmark, CheckCircle2, Receipt } from 'lucide-react';
import type { EmployeeBankAccount, EnrichedPayslipDetail } from '@/types/employee';
import { cn } from '@/lib/utils';

interface SalaryAccountCardProps {
  bankAccounts: EmployeeBankAccount[];
  detail?: EnrichedPayslipDetail;
}

/**
 * Where the salary goes: masked bank/UPI account + the latest payment's
 * reference number and credited timestamp, for transaction transparency.
 */
export function SalaryAccountCard({ bankAccounts, detail }: SalaryAccountCardProps) {
  const primary = bankAccounts.find((a) => a.is_primary) ?? bankAccounts[0];
  const payment = detail?.payment;
  const creditedAt = payment?.paid_at ?? payment?.payment_date ?? null;

  if (!primary && !payment) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Salary Account</p>
      </div>

      {primary && (
        <div className="flex items-start gap-3 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Landmark className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900">{primary.bank_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5 font-mono">{primary.account_number_masked}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
                {primary.account_type}
              </span>
              {primary.upi_id && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                  UPI: {primary.upi_id}
                </span>
              )}
              {primary.verification_status === 'verified' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {payment && (
        <div className={cn('px-5 py-4', primary && 'border-t border-gray-100')}>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
              <Receipt className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {payment.transaction_reference && (
                <p className="text-[12px] text-gray-600">
                  Reference: <span className="font-mono text-gray-800">{payment.transaction_reference}</span>
                </p>
              )}
              {creditedAt && (
                <p className="text-[12px] text-gray-600">
                  Credited on <span className="font-medium text-gray-800">{format(new Date(creditedAt), 'd MMM yyyy, h:mm a')}</span>
                </p>
              )}
              {payment.method && (
                <p className="text-[12px] text-gray-400 capitalize">via {payment.method.replace('_', ' ')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
