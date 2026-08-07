'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalPayslips } from '@/components/employee/desktop/portal-payslips';
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { usePayrollData } from '@/components/employee/payroll/use-payroll-data';
import { PayslipViewerSheet } from '@/components/employee/payroll/payslip-viewer-sheet';
import { PayrollStatusChip } from '@/components/employee/payroll/payroll-status-chip';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { SkeletonCard } from '@/components/employee/shared/skeleton-card';
import { employeeApi } from '@/lib/employee-api';
import { formatCurrency, cn } from '@/lib/utils';
import { friendlyLabel, getLeaveDeductionAmount, periodLabel } from '@/lib/payroll-derive';
import { getPayrollStatus } from '@/lib/payroll-status';
import { generatePayslipPdf } from '@/lib/generate-payslip-pdf';
import type { EmployeePayslip, EnrichedPayslipDetail } from '@/types/employee';

export default function PayslipsPage() {
  return (
    <EmployeeGuard>
      <div className="md:hidden">
        <MobilePayslipsContent />
      </div>

      <div className="hidden md:block">
        <PortalPayslips />
      </div>
    </EmployeeGuard>
  );
}

function MobilePayslipsContent() {
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { payslips, latest, detail, otRequests, isLoading, isDetailLoading } = usePayrollData();

  const handleDownload = async (payslip: EmployeePayslip) => {
    if (downloadingId) return;

    setDownloadingId(payslip.id);
    try {
      const payslipDetail = detail?.id === payslip.id ? detail : await employeeApi.getPayslipDetail(payslip.id);
      await generatePayslipPdf(payslipDetail, {
        download: true,
        filename: payslipDetail.period?.payslip_number ?? undefined,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
      <MobileHeader title="My Payroll" />

      <div className="space-y-4 px-4 pb-8 pt-4">
        <CurrentSalaryCard
          latest={latest}
          detail={detail}
          isLoading={isLoading}
          isDownloading={!!latest && downloadingId === latest.id}
          onView={() => latest && setSelected(latest)}
          onDownload={() => latest && handleDownload(latest)}
        />

        <MobileSalaryBreakdown detail={detail} latest={latest} isLoading={isDetailLoading} />

        <section>
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">Past Payrolls</p>
            <p className="mt-0.5 text-xs text-muted-foreground">View or download previous payslips</p>
          </div>
          <PastPayrollCards
            payslips={payslips}
            isLoading={isLoading}
            expandedId={expandedId}
            downloadingId={downloadingId}
            onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
            onView={setSelected}
            onDownload={handleDownload}
          />
        </section>
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

function CurrentSalaryCard({
  latest,
  detail,
  isLoading,
  isDownloading,
  onView,
  onDownload,
}: {
  latest?: EmployeePayslip;
  detail?: EnrichedPayslipDetail;
  isLoading: boolean;
  isDownloading: boolean;
  onView: () => void;
  onDownload: () => void;
}) {
  if (isLoading) {
    return <SkeletonCard className="min-h-52" lines={4} />;
  }

  if (!latest) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Payroll is being set up"
          subtitle="Your first salary card will appear once payroll is processed."
        />
      </div>
    );
  }

  const status = getPayrollStatus(latest, detail?.payment);
  const paymentDate = latest.paid_at ?? detail?.payment?.payment_date ?? detail?.payment?.paid_at;

  return (
    <section className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/75">Current Month Salary</p>
            <p className="mt-2 text-3xl font-bold leading-tight tabular-nums">{formatCurrency(latest.net_salary)}</p>
            <p className="mt-1 text-sm text-primary-foreground/75">{periodLabel(latest.month, latest.year)}</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Wallet className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-primary-foreground/65">Status</p>
            <p className="mt-1 text-sm font-semibold">{status.label}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-[11px] uppercase tracking-wide text-primary-foreground/65">Payment Date</p>
            <p className="mt-1 text-sm font-semibold">{paymentDate ? format(new Date(paymentDate), 'd MMM yyyy') : 'Pending'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-white/15">
        <button type="button" onClick={onView} className="flex min-h-12 items-center justify-center gap-2 text-sm font-semibold transition-colors hover:bg-white/10">
          <FileText className="h-4 w-4" />
          View
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={isDownloading}
          className="flex min-h-12 items-center justify-center gap-2 border-l border-white/15 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </button>
      </div>
    </section>
  );
}

function MobileSalaryBreakdown({
  detail,
  latest,
  isLoading,
}: {
  detail?: EnrichedPayslipDetail;
  latest?: EmployeePayslip;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState<string>('allowances');

  const taxItems = useMemo(
    () => (detail?.deductions ?? []).filter((item) => /tax|tds|professional/i.test(item.label)),
    [detail?.deductions],
  );
  const leaveDeduction = getLeaveDeductionAmount(detail, latest);
  const overtimeAmount = latest?.overtime_amount ?? 0;

  if (isLoading) {
    return <SkeletonCard lines={5} />;
  }

  if (!detail && !latest) return null;

  const accordions = [
    {
      id: 'allowances',
      title: 'Allowances',
      total: detail?.totals.gross_salary ?? latest?.gross_salary ?? 0,
      rows: detail?.earnings ?? latest?.components.filter((item) => item.type === 'earning') ?? [],
    },
    {
      id: 'deductions',
      title: 'Deductions',
      total: detail?.totals.total_deductions ?? latest?.total_deductions ?? 0,
      rows: detail?.deductions ?? latest?.components.filter((item) => item.type === 'deduction') ?? [],
      negative: true,
    },
    {
      id: 'tax',
      title: 'Tax',
      total: taxItems.reduce((sum, item) => sum + item.amount, 0),
      rows: taxItems,
      negative: true,
    },
    {
      id: 'overtime',
      title: 'Overtime',
      total: overtimeAmount,
      rows: overtimeAmount > 0 ? [{ label: 'Overtime Earnings', amount: overtimeAmount }] : [],
    },
    {
      id: 'leave',
      title: 'Leave Deductions',
      total: leaveDeduction,
      rows: leaveDeduction > 0 ? [{ label: 'Leave / absence deduction', amount: leaveDeduction }] : [],
      negative: true,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Salary Breakdown</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail?.period.period_label ?? 'Latest payroll'}</p>
      </div>

      <div className="divide-y divide-border">
        {accordions.map((accordion) => (
          <div key={accordion.id}>
            <button
              type="button"
              onClick={() => setOpen((current) => (current === accordion.id ? '' : accordion.id))}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{accordion.title}</p>
                <p className={cn('mt-0.5 text-xs font-medium tabular-nums', accordion.negative && accordion.total > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                  {accordion.negative && accordion.total > 0 ? '-' : ''}
                  {formatCurrency(accordion.total)}
                </p>
              </div>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open === accordion.id && 'rotate-180')} />
            </button>

            {open === accordion.id && (
              <div className="space-y-2 bg-muted/25 px-4 py-3">
                {accordion.rows.length > 0 ? (
                  accordion.rows.map((row, index) => (
                    <div key={`${accordion.id}-${row.label}-${index}`} className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-muted-foreground">{friendlyLabel(row.label)}</p>
                      <p className={cn('shrink-0 text-sm font-semibold tabular-nums', accordion.negative ? 'text-red-600' : 'text-foreground')}>
                        {accordion.negative ? '-' : ''}
                        {formatCurrency(row.amount)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No items for this period.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function PastPayrollCards({
  payslips,
  isLoading,
  expandedId,
  downloadingId,
  onToggle,
  onView,
  onDownload,
}: {
  payslips: EmployeePayslip[];
  isLoading: boolean;
  expandedId: string | null;
  downloadingId: string | null;
  onToggle: (id: string) => void;
  onView: (payslip: EmployeePayslip) => void;
  onDownload: (payslip: EmployeePayslip) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => <SkeletonCard key={item} lines={3} />)}
      </div>
    );
  }

  if (!payslips.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState
          icon={<ReceiptText className="h-6 w-6" />}
          title="No payslips yet"
          subtitle="Past payrolls will appear here after processing."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payslips.map((payslip) => {
        const isExpanded = expandedId === payslip.id;

        return (
          <article key={payslip.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => onToggle(payslip.id)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{periodLabel(payslip.month, payslip.year)}</p>
                <p className="mt-1 text-xl font-bold text-foreground">{formatCurrency(payslip.net_salary)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <PayrollStatusChip payslip={payslip} />
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
              </div>
            </button>

            {isExpanded && (
              <div className="space-y-3 border-t border-border bg-muted/25 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <PayrollStat label="Gross" value={formatCurrency(payslip.gross_salary)} />
                  <PayrollStat label="Deductions" value={`-${formatCurrency(payslip.total_deductions)}`} danger />
                  <PayrollStat label="Overtime" value={formatCurrency(payslip.overtime_amount ?? 0)} />
                  <PayrollStat label="Status" value={getPayrollStatus(payslip).label} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onView(payslip)}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground"
                  >
                    <FileText className="h-4 w-4" />
                    View Payslip
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(payslip)}
                    disabled={downloadingId === payslip.id}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {downloadingId === payslip.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function PayrollStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums text-foreground', danger && 'text-red-600')}>{value}</p>
    </div>
  );
}
