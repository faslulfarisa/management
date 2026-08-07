'use client';

import { useState } from 'react';
import type { EnrichedPayslipDetail } from '@/types/employee';
import { numberToWords } from '@/lib/pdf-utils';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';

interface Props {
  data: EnrichedPayslipDetail;
  className?: string;
}

function buildSalaryCalculationLines(
  data: EnrichedPayslipDetail,
  money: (amount: number) => string,
  payBasisText: string | null,
) {
  return [
    payBasisText ? `Pay basis: ${payBasisText}` : null,
    data.attendance && data.worked_units !== null && data.worked_units !== undefined
      ? `Attendance basis: ${data.worked_units} payable unit(s) from ${data.attendance.total_working_days} working day(s)`
      : null,
    `Gross Salary = earnings total ${money(data.totals.gross_salary)}`,
    `Net Pay = Gross ${money(data.totals.gross_salary)} - Deductions ${money(data.totals.total_deductions)} = ${money(data.totals.net_salary)}`,
  ].filter(Boolean) as string[];
}

export function PayslipTemplate({ data, className }: Props) {
  const { company, employee, period, earnings, deductions, fines, totals, attendance, payment } = data;
  const [logoError, setLogoError] = useState(false);
  const money = (n: number) => formatCurrency(n, data.currency?.code, { maximumFractionDigits: 0 });

  const accentColor = company.header_color || '#1e3a8a';

  const designation = [employee.designation_name, employee.department_name].filter(Boolean).join(' · ');
  const contactLine = [
    company.phone,
    company.email,
    company.show_gstin && company.gstin ? 'GSTIN: ' + company.gstin : null,
  ].filter(Boolean).join('  ·  ');

  const payDate =
    payment?.payment_date ?? payment?.paid_at ?? data.paid_at
      ? new Date((payment?.payment_date ?? payment?.paid_at ?? data.paid_at)!).toLocaleDateString('en-IN')
      : null;
  const payBasisText = (() => {
    if (!data.pay_basis) return null;
    const rate = data.rate || 0;
    const units = data.worked_units || 0;
    if (data.pay_basis === 'weekly_salary') return `Weekly: ${money(rate)} x ${units} Weeks`;
    if (['daily_wage', 'daily_weekly_payroll', 'daily_monthly_payroll'].includes(data.pay_basis)) {
      return `Daily: ${money(rate)} x ${units} Days`;
    }
    if (['hourly_wage', 'hourly_weekly_payroll', 'hourly_monthly_payroll'].includes(data.pay_basis)) {
      return `Hourly: ${money(rate)} x ${units} Hours`;
    }
    if (data.pay_basis === 'half_day_rate') return `Half-Day: ${money(rate)} x ${units} Half-Days`;
    return `Monthly: ${money(data.rate || totals.gross_salary)}`;
  })();
  const salaryCalculationLines = buildSalaryCalculationLines(data, money, payBasisText);

  return (
    <div className={cn('bg-white overflow-hidden border border-gray-300', className)}>

      {/* Thin brand accent bar */}
      <div style={{ backgroundColor: accentColor }} className="h-[3px]" />

      {/* ── Company header ─────────────────────────────────────────────────── */}
      <div className="relative px-6 py-4 flex items-start justify-between gap-4 border-b border-gray-200">

        {/* Watermark */}
        {company.watermark_enabled && company.watermark_text && (
          <span
            style={{ opacity: company.watermark_opacity ?? 0.05 }}
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center -rotate-45 text-5xl font-black text-gray-500 overflow-hidden whitespace-nowrap"
          >
            {company.watermark_text}
          </span>
        )}

        {/* Logo + company info */}
        <div className="relative flex items-start gap-3 min-w-0">
          {company.logo_url && !logoError && (
            <img
              src={company.logo_url}
              alt=""
              onError={() => setLogoError(true)}
              className="h-10 w-10 object-contain flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-gray-900 font-bold text-sm leading-tight">{company.name}</p>
            {company.legal_name && company.legal_name !== company.name && (
              <p className="text-gray-500 text-[11px] leading-tight mt-0.5">{company.legal_name}</p>
            )}
            {company.show_address && company.address && (
              <p className="text-gray-400 text-[11px] leading-snug mt-0.5 line-clamp-2">{company.address}</p>
            )}
            {contactLine && (
              <p className="text-gray-400 text-[10px] mt-0.5">{contactLine}</p>
            )}
          </div>
        </div>

        {/* PAYSLIP label + reference number */}
        <div className="relative flex-shrink-0 text-right">
          <p className="text-gray-700 font-bold text-[13px] tracking-[0.12em] uppercase">Payslip</p>
          {period.payslip_number && (
            <p className="text-gray-400 text-[10px] mt-0.5 font-mono">{period.payslip_number}</p>
          )}
        </div>
      </div>

      {/* ── Employee information ────────────────────────────────────────────── */}
      <div className="px-6 py-3 grid grid-cols-2 gap-x-8 border-b border-gray-200 bg-gray-50">
        {/* Left column */}
        <div className="space-y-0.5 min-w-0">
          <p className="text-gray-900 font-semibold text-sm leading-snug">
            {employee.first_name} {employee.last_name}
          </p>
          {designation && (
            <p className="text-gray-500 text-[11px] leading-snug">{designation}</p>
          )}
          {employee.date_of_joining && (
            <p className="text-gray-400 text-[11px]">
              DOJ: <span className="text-gray-600">{employee.date_of_joining}</span>
            </p>
          )}
          {employee.uan_number && (
            <p className="text-gray-400 text-[11px]">
              UAN: <span className="text-gray-600 font-mono">{employee.uan_number}</span>
            </p>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-0.5 min-w-0">
          <p className="text-gray-400 text-[11px]">
            Emp Code: <span className="text-gray-700 font-semibold font-mono">{employee.employee_code}</span>
          </p>
          <p className="text-gray-400 text-[11px]">
            Pay Period: <span className="text-gray-600 font-medium">{period.period_label}</span>
          </p>
          {employee.branch_name && (
            <p className="text-gray-400 text-[11px]">
              Branch: <span className="text-gray-600">{employee.branch_name}</span>
            </p>
          )}
          {employee.pan_number && (
            <p className="text-gray-400 text-[11px]">
              PAN: <span className="text-gray-600 font-mono">{employee.pan_number}</span>
            </p>
          )}
          {payDate && (
            <p className="text-gray-400 text-[11px]">
              Payment Date: <span className="text-gray-600">{payDate}</span>
            </p>
          )}
          {payBasisText && (
            <p className="text-gray-400 text-[11px]">
              Pay Basis:{' '}
              <span className="text-gray-600 font-medium">{payBasisText}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Earnings / Deductions ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">

        {/* Earnings */}
        <div>
          <div className="grid grid-cols-2 bg-gray-800 px-3 py-2 text-[11px] font-semibold text-white">
            <span>Earnings</span>
            <span className="text-right">Amount</span>
          </div>
          {earnings.map((e, i) => (
            <div
              key={i}
              className={cn(
                'grid grid-cols-2 px-3 py-1.5 text-[11px]',
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              )}
            >
              <span className="text-gray-600 truncate pr-2">{e.label}</span>
              <span className="text-gray-800 font-medium text-right tabular-nums">{money(e.amount)}</span>
            </div>
          ))}
          <div className="grid grid-cols-2 px-3 py-2 text-[11px] font-semibold bg-gray-100 border-t border-gray-300">
            <span className="text-gray-700">Gross Salary</span>
            <span className="text-gray-900 text-right tabular-nums">{money(totals.gross_salary)}</span>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <div className="grid grid-cols-2 bg-gray-800 px-3 py-2 text-[11px] font-semibold text-white">
            <span>Deductions</span>
            <span className="text-right">Amount</span>
          </div>
          {deductions.map((d, i) => (
            <div
              key={i}
              className={cn(
                'grid grid-cols-2 px-3 py-1.5 text-[11px]',
                i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              )}
            >
              <span className="text-gray-600 truncate pr-2">{d.label}</span>
              <span className="text-gray-800 font-medium text-right tabular-nums">{money(d.amount)}</span>
            </div>
          ))}
          <div className="grid grid-cols-2 px-3 py-2 text-[11px] font-semibold bg-gray-100 border-t border-gray-300">
            <span className="text-gray-700">Total Deductions</span>
            <span className="text-gray-900 text-right tabular-nums">{money(totals.total_deductions)}</span>
          </div>
        </div>
      </div>

      {/* ── Attendance summary ──────────────────────────────────────────────── */}
      {attendance && (
        <div className="px-6 py-2 border-b border-gray-200 bg-white">
          <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-gray-400">
            <span>Working Days: <span className="text-gray-700 font-medium">{attendance.total_working_days}</span></span>
            <span>Present: <span className="text-gray-700 font-medium">{attendance.present_days}</span></span>
            <span>Absent: <span className="text-gray-700 font-medium">{attendance.absent_days}</span></span>
            <span>Late: <span className="text-gray-700 font-medium">{attendance.late_count}</span></span>
            <span>Half Day: <span className="text-gray-700 font-medium">{attendance.half_day_count}</span></span>
            <span>OT: <span className="text-gray-700 font-medium">{Number(attendance.overtime_hours).toFixed(1)}h</span></span>
          </div>
        </div>
      )}

      {/* ── Net pay ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-2.5 border-b border-gray-200 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
          Salary Calculation
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1">
          {salaryCalculationLines.map((line) => (
            <p key={line} className="text-[10px] text-gray-500 leading-snug">
              {line}
            </p>
          ))}
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div
          style={{ borderLeftColor: accentColor }}
          className="border-l-4 px-5 py-4 bg-gray-50 flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Net Pay</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              {numberToWords(totals.net_salary)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight">
              {money(totals.net_salary)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Gross {money(totals.gross_salary)} &minus; Deductions {money(totals.total_deductions)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Fine deductions ─────────────────────────────────────────────────── */}
      {fines && fines.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-200">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
            Fine Deductions
          </p>
          <div className="overflow-hidden border border-gray-200">
            <div className="grid grid-cols-[1fr_1fr_auto] bg-gray-800 text-white text-[11px] font-semibold px-3 py-2 gap-3">
              <span>Title</span>
              <span>Category</span>
              <span className="text-right">Amount</span>
            </div>
            {fines.map((f, i) => (
              <div
                key={f.id}
                className={cn(
                  'grid grid-cols-[1fr_1fr_auto] text-[11px] px-3 py-1.5 gap-3 border-t border-gray-100',
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
                )}
              >
                <span className="text-gray-700 truncate">{f.title}</span>
                <span className="text-gray-500 truncate">{f.category ?? '—'}</span>
                <span className="text-gray-800 font-medium text-right tabular-nums whitespace-nowrap">
                  {money(f.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer / Declaration ────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-center space-y-0.5">
        <p className="text-[10px] text-gray-400">
          This is a computer-generated payslip and does not require a physical signature.
        </p>
        {company.footer_text && (
          <p className="text-[10px] text-gray-400">{company.footer_text}</p>
        )}
      </div>
    </div>
  );
}
