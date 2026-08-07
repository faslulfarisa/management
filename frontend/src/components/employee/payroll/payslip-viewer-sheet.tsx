'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import type { EmployeePayslip, EnrichedPayslipDetail, MyOvertimeRequest } from '@/types/employee';
import { employeeApi } from '@/lib/employee-api';
import { formatCurrency } from '@/lib/utils';
import { periodLabel } from '@/lib/payroll-derive';
import { getPayrollStatus } from '@/lib/payroll-status';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';
import { PayslipTemplate } from '@/components/payslips/payslip-template';
import { generatePayslipPdf } from '@/lib/generate-payslip-pdf';
import { PayrollStatusChip } from './payroll-status-chip';
import { SalaryBreakdown } from './salary-breakdown';
import { DeductionTransparency } from './deduction-transparency';
import { OvertimeSection } from './overtime-section';

interface PayslipViewerSheetProps {
  payslipId: string | null;
  payslipSummary?: EmployeePayslip;
  otRequests?: MyOvertimeRequest[];
  onClose: () => void;
}

/**
 * Friendly "My Payroll" payslip viewer — a banking-app style summary
 * (net pay hero, simplified breakdown, deduction explanations, overtime,
 * attendance) with the original PayslipTemplate kept underneath as a
 * collapsible "Official Payslip" for the unchanged PDF download.
 */
export function PayslipViewerSheet({ payslipId, payslipSummary, otRequests = [], onClose }: PayslipViewerSheetProps) {
  const [downloading, setDownloading] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);

  const { data: detail, isLoading } = useQuery<EnrichedPayslipDetail>({
    queryKey: ['payslip-detail', payslipId],
    queryFn: () => employeeApi.getPayslipDetail(payslipId!),
    enabled: !!payslipId,
    staleTime: 10 * 60_000,
  });

  const sheetTitle = detail
    ? periodLabel(detail.month, detail.year)
    : payslipSummary
      ? periodLabel(payslipSummary.month, payslipSummary.year)
      : 'Payslip';

  const periodOtRequests = detail
    ? otRequests.filter((r) => r.payroll_month === detail.month && r.payroll_year === detail.year)
    : [];

  const status = detail ? getPayrollStatus(detail, detail.payment) : undefined;
  const attendance = detail?.attendance;

  const handleDownload = async () => {
    if (!detail || downloading) return;
    setDownloading(true);
    try {
      await generatePayslipPdf(detail, {
        download: true,
        filename: detail.period?.payslip_number ?? undefined,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <BottomSheet open={!!payslipId} onOpenChange={(v) => !v && onClose()}>
      <BottomSheetContent title={sheetTitle}>
        {isLoading || !detail ? (
          <div className="px-5 pb-8 space-y-3 py-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="px-4 pb-4 space-y-3">
              {/* Net pay hero */}
              <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-medium opacity-80">
                      {detail.period?.payslip_number ?? sheetTitle}
                    </p>
                  </div>
                  {status && <PayrollStatusChip status={status} className="bg-white/15 text-white" />}
                </div>
                <p className="text-[11px] uppercase tracking-wider opacity-70">Net Pay</p>
                <p className="text-3xl font-bold mt-0.5">{formatCurrency(detail.totals.net_salary)}</p>
              </div>

              <SalaryBreakdown detail={detail} isLoading={false} />

              <DeductionTransparency detail={detail} />

              <OvertimeSection latest={payslipSummary} detail={detail} otRequests={periodOtRequests} />

              {attendance && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Attendance Summary</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 px-5 py-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{attendance.present_days}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Present</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{attendance.absent_days}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Absent</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{attendance.late_count}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Late</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Official payslip — original print template, unchanged */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowOfficial((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Official Payslip</p>
                  {showOfficial ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {showOfficial && (
                  <div className="border-t border-gray-100 p-2">
                    <PayslipTemplate data={detail} />
                  </div>
                )}
              </div>
            </div>

            {/* Sticky download footer */}
            <div className="sticky bottom-0 bg-background border-t border-border px-5 py-3">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold py-3 disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download PDF
              </button>
            </div>
          </>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
