'use client';

import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type { TooltipValueType } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { shortMonth } from '@/lib/payroll-derive';
import type { PayrollAnalyticsProps } from './payroll-analytics';

const tooltipFormatter = (value: TooltipValueType | undefined) =>
  formatCurrency(Array.isArray(value) ? Number(value[0]) : Number(value ?? 0));
const axisFormatter = (value: number) => {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
};

export default function PayrollAnalyticsImpl({ payslips }: PayrollAnalyticsProps) {
  const chartData = [...payslips]
    .reverse()
    .map((p) => ({
      period: `${shortMonth(p.month)} ${String(p.year).slice(-2)}`,
      net: p.net_salary,
      gross: p.gross_salary,
      deductions: p.total_deductions,
      overtime: p.overtime_amount,
    }));

  if (chartData.length < 2) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Payroll Insights</p>
        <p className="text-[12px] text-gray-400 py-6 text-center">
          Trends will appear here once you have at least two payslips.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payroll Insights</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* Earnings trend */}
        <div className="px-5 py-4">
          <p className="text-[12px] font-medium text-gray-600 mb-2">Earnings Trend</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={axisFormatter} />
              <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="gross" name="Gross" stroke="#93c5fd" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" name="Net Pay" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Deductions & OT trend */}
        <div className="px-5 py-4">
          <p className="text-[12px] font-medium text-gray-600 mb-2">Deductions &amp; Overtime</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={axisFormatter} />
              <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="deductions" name="Deductions" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="overtime" name="Overtime" fill="#a7f3d0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
