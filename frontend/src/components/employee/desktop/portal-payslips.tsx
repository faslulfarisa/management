'use client';

import { useState } from 'react';
import type { EmployeePayslip } from '@/types/employee';
import { usePayrollData } from '@/components/employee/payroll/use-payroll-data';
import { SalaryHeroCard } from '@/components/employee/payroll/salary-hero-card';
import { SalaryKpiStrip } from '@/components/employee/payroll/salary-kpi-strip';
import { SalaryBreakdown } from '@/components/employee/payroll/salary-breakdown';
import { DeductionTransparency } from '@/components/employee/payroll/deduction-transparency';
import { OvertimeSection } from '@/components/employee/payroll/overtime-section';
import { SalaryAccountCard } from '@/components/employee/payroll/salary-account-card';
import { PayrollAnalytics } from '@/components/employee/payroll/payroll-analytics';
import { PayrollActivityFeed } from '@/components/employee/payroll/payroll-activity-feed';
import { SalaryTimeline } from '@/components/employee/payroll/salary-timeline';
import { PayslipViewerSheet } from '@/components/employee/payroll/payslip-viewer-sheet';

export function PortalPayslips() {
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const { payslips, latest, detail, bankAccounts, otRequests, isLoading, isDetailLoading } = usePayrollData();

  return (
    <div>
      {/* Sticky page header */}
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Payroll</h1>
      </div>

      <div className="p-6 space-y-5 max-w-[1100px]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <SalaryHeroCard
              latest={latest}
              detail={detail}
              isLoading={isLoading}
              onViewPayslip={() => latest && setSelected(latest)}
            />
          </div>
          <SalaryAccountCard bankAccounts={bankAccounts} detail={detail} />
        </div>

        <SalaryKpiStrip latest={latest} detail={detail} payslips={payslips} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <SalaryBreakdown detail={detail} isLoading={isDetailLoading} />
            <DeductionTransparency detail={detail} />
          </div>
          <OvertimeSection latest={latest} detail={detail} otRequests={otRequests} />
        </div>

        <PayrollAnalytics payslips={payslips} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SalaryTimeline payslips={payslips} isLoading={isLoading} onSelect={setSelected} />
          <PayrollActivityFeed payslips={payslips} />
        </div>
      </div>

      <PayslipViewerSheet
        payslipId={selected?.id ?? null}
        payslipSummary={selected ?? undefined}
        otRequests={otRequests}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
