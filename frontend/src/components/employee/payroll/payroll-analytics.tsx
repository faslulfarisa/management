'use client';

import dynamic from 'next/dynamic';
import type { EmployeePayslip } from '@/types/employee';

export interface PayrollAnalyticsProps {
  payslips: EmployeePayslip[];
}

// recharts is ~100KB+ — load it on demand instead of bundling it into every
// page that renders the employee payslips list.
export const PayrollAnalytics = dynamic<PayrollAnalyticsProps>(
  () => import('./payroll-analytics-impl'),
  {
    ssr: false,
    loading: () => <div className="h-[228px] w-full animate-pulse rounded-2xl bg-gray-100" />,
  },
);
