'use client';

import { useState } from 'react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalPayslips } from '@/components/employee/desktop/portal-payslips';
// ── Mobile imports ──────────────────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
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
import type { EmployeePayslip } from '@/types/employee';

export default function PayslipsPage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (redesigned salary portal) ───────────────── */}
      <div className="md:hidden">
        <MobilePayslipsContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalPayslips />
      </div>
    </EmployeeGuard>
  );
}

function MobilePayslipsContent() {
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const { payslips, latest, detail, bankAccounts, otRequests, isLoading, isDetailLoading } = usePayrollData();

  return (
    <div className="flex flex-col">
      <MobileHeader title="My Payroll" />

      <div className="px-4 pt-4 pb-8 space-y-4">
        <SalaryHeroCard
          latest={latest}
          detail={detail}
          isLoading={isLoading}
          onViewPayslip={() => latest && setSelected(latest)}
        />

        <SalaryKpiStrip latest={latest} detail={detail} payslips={payslips} isLoading={isLoading} />

        <SalaryBreakdown detail={detail} isLoading={isDetailLoading} />

        <DeductionTransparency detail={detail} />

        <OvertimeSection latest={latest} detail={detail} otRequests={otRequests} />

        <SalaryAccountCard bankAccounts={bankAccounts} detail={detail} />

        <PayrollAnalytics payslips={payslips} />

        <SalaryTimeline payslips={payslips} isLoading={isLoading} onSelect={setSelected} />

        <PayrollActivityFeed payslips={payslips} />
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
