'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Loader2, DollarSign, CheckCircle, XCircle, Lock, RefreshCw,
  AlertTriangle, CreditCard, RotateCcw, Ban, Banknote, ExternalLink, Eye,
  CalendarDays, Users, ClipboardCheck, FileText, PlayCircle, BarChart3,
  ArrowRight, Info, ShieldCheck, WalletCards,
} from 'lucide-react';
import { AdminPayslipModal } from '@/components/payslips/admin-payslip-modal';
import { AttendanceSummaryTab } from '@/components/payroll/attendance-summary-tab';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  payroll_locked: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  processed: 'bg-blue-100 text-blue-800',
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
  reversed: 'bg-orange-100 text-orange-800',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank Transfer',
  neft: 'NEFT',
  imps: 'IMPS',
  rtgs: 'RTGS',
  upi: 'UPI',
  razorpay: 'Razorpay (Auto)',
};

const BANK_REQUIRED_METHODS = new Set(['bank_transfer', 'neft', 'imps', 'rtgs', 'upi', 'razorpay']);

function fmt(n: number | string) {
  return `₹${parseFloat(String(n)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

type ReadinessStatus = 'ready' | 'warning' | 'blocked';

interface ReadinessRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  status: ReadinessStatus;
  issue: string;
  actionLabel: string;
  targetTab?: Tab;
  href?: string;
}

interface PayrollOverviewData {
  employees: any[];
  summaries: any[];
  payslips: any[];
  payments: any[];
  runId: string;
}

const READINESS_COLORS: Record<ReadinessStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
};

const WORKFLOW_STEPS = [
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'summary', label: 'Attendance Summary' },
  { key: 'approval', label: 'Attendance Approval' },
  { key: 'lock', label: 'Payroll Lock' },
  { key: 'preview', label: 'Payroll Preview' },
  { key: 'generate', label: 'Generate Payslips' },
  { key: 'review', label: 'Payroll Review' },
  { key: 'process', label: 'Process Payroll' },
  { key: 'payments', label: 'Initiate Payments' },
];

function moneyValue(value: number) {
  return fmt(Number.isFinite(value) ? value : 0);
}

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getEmployeeName(employee: any) {
  return `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.name || 'Employee';
}

function getPeriodLabel(month: number, year: number) {
  return `${new Date(0, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
}

function getPayrollSkipReason(reason: string | null | undefined) {
  switch (reason) {
    case 'no_approved_attendance_summary':
      return 'No approved or payroll-locked attendance summary for this month.';
    case 'no_salary_structure':
      return 'No active salary structure or salary template found for this payroll period.';
    case 'payslip_already_finalized':
      return 'A finalized payslip already exists and cannot be overwritten.';
    default:
      return reason ? reason.replace(/_/g, ' ') : 'Payroll prerequisite missing.';
  }
}

function getWorkflowState(data: PayrollOverviewData) {
  const totalEmployees = data.employees.length;
  const summaryCount = data.summaries.length;
  const approvedCount = data.summaries.filter((s) => ['approved', 'payroll_locked', 'payroll_processed'].includes(s.status)).length;
  const lockedCount = data.summaries.filter((s) => ['payroll_locked', 'payroll_processed'].includes(s.status)).length;
  const payslipCount = data.payslips.length;
  const processedCount = data.payslips.filter((p) => ['processed', 'paid'].includes(p.status)).length;
  const paidCount = data.payslips.filter((p) => p.status === 'paid').length;

  const completed = {
    employees: totalEmployees > 0,
    attendance: summaryCount > 0,
    summary: summaryCount > 0,
    approval: totalEmployees > 0 && approvedCount > 0 && approvedCount === summaryCount,
    lock: totalEmployees > 0 && lockedCount > 0 && lockedCount === summaryCount,
    preview: totalEmployees > 0 && lockedCount > 0,
    generate: payslipCount > 0,
    review: payslipCount > 0,
    process: payslipCount > 0 && processedCount === payslipCount,
    payments: payslipCount > 0 && paidCount === payslipCount,
  };

  const current = WORKFLOW_STEPS.find((step) => !completed[step.key as keyof typeof completed])?.key ?? 'payments';
  return { completed, current };
}

function buildReadinessRows(data: PayrollOverviewData): ReadinessRow[] {
  const summaryByEmployee = new Map(data.summaries.map((s) => [s.employee_id, s]));
  const payslipByEmployee = new Map(data.payslips.map((p) => [p.employee_id, p]));

  return data.employees.map((employee) => {
    const summary = summaryByEmployee.get(employee.id);
    const payslip = payslipByEmployee.get(employee.id);
    const name = getEmployeeName(employee);
    const base = {
      employeeId: employee.id,
      employeeName: name,
      employeeCode: employee.employee_code ?? employee.code ?? '-',
    };

    if (!summary) {
      return {
        ...base,
        status: 'blocked' as const,
        issue: 'Attendance Summary has not been generated.',
        actionLabel: 'Generate Attendance Summary',
        targetTab: 'attendance-summary' as const,
      };
    }

    if (summary.status === 'pending_review') {
      return {
        ...base,
        status: 'blocked' as const,
        issue: 'Attendance Summary is awaiting approval.',
        actionLabel: 'Approve Attendance',
        targetTab: 'attendance-summary' as const,
      };
    }

    if (['draft', 'rejected', 'cancelled'].includes(summary.status)) {
      return {
        ...base,
        status: 'blocked' as const,
        issue: `Attendance Summary is ${summary.status.replace(/_/g, ' ')}.`,
        actionLabel: 'Review Attendance',
        targetTab: 'attendance-summary' as const,
      };
    }

    if (payslip?.status === 'paid') {
      return {
        ...base,
        status: 'ready' as const,
        issue: 'Payroll paid for this cycle.',
        actionLabel: 'View Payment',
        targetTab: 'payments' as const,
      };
    }

    if (payslip && ['processed', 'approved'].includes(payslip.status)) {
      return {
        ...base,
        status: 'warning' as const,
        issue: 'Payslip is processed and awaiting payment.',
        actionLabel: 'Initiate Payment',
        targetTab: 'payments' as const,
      };
    }

    if (payslip) {
      return {
        ...base,
        status: 'ready' as const,
        issue: 'Draft payslip is ready for payroll review.',
        actionLabel: 'Review Payslip',
        targetTab: 'payslips' as const,
      };
    }

    if (summary.status === 'approved') {
      return {
        ...base,
        status: 'warning' as const,
        issue: 'Attendance approved. Lock payroll before final generation.',
        actionLabel: 'Lock Payroll',
        targetTab: 'attendance-summary' as const,
      };
    }

    if (summary.status === 'payroll_locked') {
      return {
        ...base,
        status: 'ready' as const,
        issue: 'Ready to generate payslip.',
        actionLabel: 'Generate Payslip',
        targetTab: 'payslips' as const,
      };
    }

    return {
      ...base,
      status: 'warning' as const,
      issue: `Payroll is currently ${summary.status.replace(/_/g, ' ')}.`,
      actionLabel: 'Review',
      targetTab: 'attendance-summary' as const,
    };
  });
}

function WorkflowDashboard({
  data,
  month,
  year,
  loading,
  onNavigate,
  onGenerate,
  generating,
  actionError,
}: {
  data: PayrollOverviewData;
  month: number;
  year: number;
  loading: boolean;
  onNavigate: (tab: Tab) => void;
  onGenerate: () => void | Promise<void>;
  generating: boolean;
  actionError: string;
}) {
  const readinessRows = useMemo(() => buildReadinessRows(data), [data]);
  const workflow = useMemo(() => getWorkflowState(data), [data]);
  const ready = readinessRows.filter((r) => r.status === 'ready').length;
  const blocked = readinessRows.filter((r) => r.status === 'blocked').length;
  const warnings = readinessRows.filter((r) => r.status === 'warning').length;
  const gross = data.payslips.reduce((sum, p) => sum + parseFloat(p.gross_salary || 0), 0);
  const deductions = data.payslips.reduce((sum, p) => sum + parseFloat(p.total_deductions || 0), 0);
  const net = data.payslips.reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);
  const draftPayslips = data.payslips.filter((p) => p.status === 'draft').length;
  const processedPayslips = data.payslips.filter((p) => ['processed', 'paid'].includes(p.status)).length;
  const paidEmployees = data.payslips.filter((p) => p.status === 'paid').length;
  const pendingPayments = data.payments.filter((p) => ['pending', 'processing'].includes(p.status)).length;
  const progress = Math.round((WORKFLOW_STEPS.filter((s) => workflow.completed[s.key as keyof typeof workflow.completed]).length / WORKFLOW_STEPS.length) * 100);
  const period = getPeriodLabel(month, year);
  const canGenerate = blocked === 0 && ready > 0;

  const quickActions = [
    { label: 'Generate Attendance Summary', icon: RefreshCw, tab: 'attendance-summary' as Tab },
    { label: 'Review Attendance', icon: ClipboardCheck, tab: 'attendance-summary' as Tab },
    { label: 'Approve Attendance', icon: ShieldCheck, tab: 'attendance-summary' as Tab },
    { label: 'Lock Payroll', icon: Lock, tab: 'attendance-summary' as Tab },
    { label: 'Preview Payroll', icon: Eye, tab: 'overview' as Tab },
    { label: 'Generate Payslips', icon: PlayCircle, tab: 'payslips' as Tab, action: onGenerate },
    { label: 'Process Payroll', icon: CheckCircle, tab: 'payslips' as Tab },
    { label: 'Initiate Payments', icon: WalletCards, tab: 'payments' as Tab },
    { label: 'Payroll Reports', icon: BarChart3, href: '/dashboard/reports/payroll' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Current Payroll Month</p>
                <h2 className="text-2xl font-bold mt-1">{period}</h2>
                <p className="text-sm text-muted-foreground mt-1">Payroll Status: <span className="font-medium text-foreground">{workflow.current === 'payments' ? 'Complete' : WORKFLOW_STEPS.find((s) => s.key === workflow.current)?.label}</span></p>
              </div>
              <CalendarDays className="w-8 h-8 text-primary" />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Payroll Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
        {[
          { label: 'Employees Ready', value: ready, color: 'text-emerald-700', icon: CheckCircle },
          { label: 'Employees Blocked', value: blocked, color: 'text-red-700', icon: XCircle },
          { label: 'Draft Payslips', value: draftPayslips, color: 'text-slate-700', icon: FileText },
          { label: 'Pending Payments', value: pendingPayments, color: 'text-amber-700', icon: CreditCard },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className={`text-2xl font-bold mt-2 ${item.color}`}>{item.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Payroll Readiness Check</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Ready</p><p className="text-xl font-bold text-emerald-700">{ready}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Warnings</p><p className="text-xl font-bold text-amber-700">{warnings}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Blocked</p><p className="text-xl font-bold text-red-700">{blocked}</p></div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading readiness...</div>
            ) : readinessRows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium">No employees found for payroll.</p>
                <p className="text-sm text-muted-foreground mt-1">Add active employees before starting this payroll cycle.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {readinessRows.slice(0, 8).map((row) => (
                  <div key={row.employeeId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{row.employeeName}</p>
                        <span className="text-xs text-muted-foreground">{row.employeeCode}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${READINESS_COLORS[row.status]}`}>{row.status}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{row.issue}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => row.href ? window.location.assign(row.href) : row.targetTab && onNavigate(row.targetTab)} className="gap-2 shrink-0">
                      {row.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {readinessRows.length > 8 && <p className="text-xs text-muted-foreground text-center">Showing 8 of {readinessRows.length}. Use the validation report below for filtering.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Employees Included</span><span className="font-medium">{ready}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Employees Excluded</span><span className="font-medium">{blocked}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Gross</span><span className="font-medium">{moneyValue(gross)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Deductions</span><span className="font-medium">{moneyValue(deductions)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Net</span><span className="font-semibold">{moneyValue(net)}</span></div>
            {data.payslips.length === 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Preview totals appear after payslips are generated. Readiness still shows which employees can proceed.</p>
              </div>
            )}
            {blocked > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {blocked} employee{blocked === 1 ? '' : 's'} blocked. Fix readiness issues before bulk payroll actions.
              </div>
            )}
            {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            <Button onClick={onGenerate} disabled={!canGenerate || generating} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Generate Payslips
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant="outline"
                  className="h-auto min-h-20 flex-col gap-2 whitespace-normal px-2 py-3 text-center"
                  onClick={() => {
                    if (action.href) window.location.assign(action.href);
                    else if (action.action) action.action();
                    else if (action.tab) onNavigate(action.tab);
                  }}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs leading-tight">{action.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <PayrollValidationReport rows={readinessRows} onNavigate={onNavigate} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { label: 'Processed Payslips', value: processedPayslips },
          { label: 'Paid Employees', value: paidEmployees },
          { label: 'Estimated Net Payroll', value: moneyValue(net) },
          { label: 'Pending Approvals', value: data.summaries.filter((s) => s.status === 'pending_review').length },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-xl font-bold mt-1">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PayrollValidationReport({ rows, onNavigate }: { rows: ReadinessRow[]; onNavigate: (tab: Tab) => void }) {
  const [filter, setFilter] = useState<'all' | ReadinessStatus>('all');
  const filtered = filter === 'all' ? rows : rows.filter((row) => row.status === filter);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle>Employee Validation Report</CardTitle>
          <div className="flex gap-1 rounded-lg border p-1 w-fit">
            {(['all', 'ready', 'blocked', 'warning'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${filter === item ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {item === 'warning' ? 'Warnings' : item}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No employees match this validation filter.</div>
        ) : (
          <div className="hidden md:block">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Shortcut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <p className="font-medium">{row.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
                    </TableCell>
                    <TableCell><span className={`text-xs px-2 py-1 rounded-full border ${READINESS_COLORS[row.status]}`}>{row.status}</span></TableCell>
                    <TableCell className="text-muted-foreground">{row.issue}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => row.targetTab && onNavigate(row.targetTab)}>{row.actionLabel}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="md:hidden space-y-2 p-3">
            {filtered.map((row) => (
              <div key={row.employeeId} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{row.employeeName}</p>
                  <span className={`text-xs px-2 py-1 rounded-full border ${READINESS_COLORS[row.status]}`}>{row.status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{row.employeeCode}</p>
                <p className="text-sm mt-2">{row.issue}</p>
                <Button variant="outline" size="sm" onClick={() => row.targetTab && onNavigate(row.targetTab)} className="mt-3 w-full">{row.actionLabel}</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bank Validation Banner ─────────────────────────────────────────────────────

function BankValidationBanner({ runId }: { runId: string }) {
  const [data, setData] = useState<{ missing: any[]; incomplete: any[] } | null>(null);

  useEffect(() => {
    if (!runId) return;
    api.get(`/payroll/runs/${runId}/validate-bank-details`)
      .then(r => setData(r.data.data ?? r.data))
      .catch(() => {});
  }, [runId]);

  if (!data) return null;
  const issues = (data.missing?.length ?? 0) + (data.incomplete?.length ?? 0);
  if (issues === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-yellow-800">Bank details incomplete for {issues} employee{issues > 1 ? 's' : ''}</p>
        <p className="text-xs text-yellow-700 mt-0.5">
          {data.missing?.length > 0 && `${data.missing.length} missing bank account${data.missing.length > 1 ? 's' : ''}`}
          {data.missing?.length > 0 && data.incomplete?.length > 0 && ' · '}
          {data.incomplete?.length > 0 && `${data.incomplete.length} unverified`}
          {' — '}bank transfer payments will be skipped for these employees.
        </p>
      </div>
      <a href="/dashboard/hr/payroll/bank-accounts" className="text-xs font-medium text-yellow-800 underline underline-offset-2 whitespace-nowrap flex items-center gap-1">
        Manage <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

// ── Initiate Payment Modal ─────────────────────────────────────────────────────

function InitiatePaymentModal({ payslip, onClose, onSuccess }: {
  payslip: any | null; onClose: () => void; onSuccess: () => void;
}) {
  const [method, setMethod] = useState('bank_transfer');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payslip?.employee_id) return;
    api.get(`/payroll/bank-accounts/employee/${payslip.employee_id}`)
      .then(r => {
        const accounts = r.data.data ?? r.data ?? [];
        setBankAccounts(accounts);
        const primary = accounts.find((a: any) => a.is_primary);
        if (primary) setBankAccountId(primary.id);
      })
      .catch(() => {});
  }, [payslip?.employee_id]);

  const needsBank = BANK_REQUIRED_METHODS.has(method);

  const submit = async () => {
    setError('');
    if (needsBank && !bankAccountId) { setError('Please select a bank account'); return; }
    setSaving(true);
    try {
      await api.post(`/payroll/payslips/${payslip.id}/initiate-payment`, {
        payment_method: method,
        ...(needsBank && bankAccountId ? { bank_account_id: bankAccountId } : {}),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to initiate payment');
    } finally {
      setSaving(false);
    }
  };

  if (!payslip) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Initiate Payment</DialogTitle>
          <DialogDescription>{payslip.first_name} {payslip.last_name} — {fmt(payslip.net_salary)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Payment Method <span className="text-red-500">*</span></label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {needsBank && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Bank Account <span className="text-red-500">*</span></label>
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  No bank accounts found for this employee.{' '}
                  <a href="/dashboard/hr/payroll/bank-accounts" className="underline">Add one</a>
                </p>
              ) : (
                <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select account…</option>
                  {bankAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} ····{a.account_number_masked?.slice(-4) ?? '****'} {a.is_primary ? '(Primary)' : ''} {a.verification_status === 'verified' ? '✓' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {method === 'razorpay' && (
            <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Payment will be processed automatically via Razorpay. Funds typically arrive within minutes.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || (needsBank && bankAccounts.length === 0)} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Initiate Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Initiate Modal ────────────────────────────────────────────────────────

function BulkInitiateModal({ runId, onClose, onSuccess }: {
  runId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [method, setMethod] = useState('bank_transfer');
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      await api.post(`/payroll/runs/${runId}/bulk-initiate-payments`, { payment_method: method, skip_invalid: skipInvalid });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Bulk initiation failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Initiate Payments</DialogTitle>
          <DialogDescription>Initiate payments for all unpaid payslips in this run</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Payment Method <span className="text-red-500">*</span></label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={skipInvalid} onChange={e => setSkipInvalid(e.target.checked)} className="rounded" />
            <span className="text-sm">Skip employees with missing / unverified bank details</span>
          </label>
          {!skipInvalid && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              Employees without valid bank details will cause individual failures.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            Initiate All Payments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark Manual Paid Modal ─────────────────────────────────────────────────────

function MarkManualPaidModal({ payment, onClose, onSuccess }: {
  payment: any | null; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({ transaction_reference: '', payment_date: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isCashPayment = payment?.payment_method === 'cash';

  const submit = async () => {
    setError('');
    if (!isCashPayment && !form.transaction_reference.trim()) { setError('Transaction reference is required'); return; }
    if (!form.payment_date) { setError('Payment date is required'); return; }
    setSaving(true);
    try {
      await api.patch(`/payroll/payments/${payment.id}/mark-paid`, {
        ...form,
        transaction_reference: isCashPayment ? undefined : form.transaction_reference.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to mark as paid');
    } finally {
      setSaving(false);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
          <DialogDescription>{isCashPayment ? 'Confirm the cash payment date to mark as paid' : 'Enter transaction details to mark as paid'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {!isCashPayment && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">UTR / Reference No. <span className="text-red-500">*</span></label>
              <input value={form.transaction_reference} onChange={e => setForm(f => ({ ...f, transaction_reference: e.target.value }))}
                placeholder="UTR123456789" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Payment Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Mark Paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reverse Payment Modal ──────────────────────────────────────────────────────

function ReversePaymentModal({ payment, onClose, onSuccess }: {
  payment: any | null; onClose: () => void; onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!reason.trim()) { setError('Reason is required'); return; }
    setSaving(true);
    try {
      await api.patch(`/payroll/payments/${payment.id}/reverse`, { reason });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to reverse payment');
    } finally {
      setSaving(false);
    }
  };

  if (!payment) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reverse Payment</DialogTitle>
          <DialogDescription>This will roll back the payslip to processed status</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Reason <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for reversal…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="gap-2 bg-red-600 hover:bg-red-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reverse Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payments Tab ───────────────────────────────────────────────────────────────

function PaymentsTab({ runId, month, year }: { runId: string; month: number; year: number }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<any | null>(null);
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [retryLoading, setRetryLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchPayments = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const res = await api.get(`/payroll/runs/${runId}/payments`);
      setPayments(res.data.data ?? res.data ?? []);
    } catch {
      setError('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const retry = async (payment: any) => {
    setRetryLoading(payment.id);
    setError('');
    try {
      await api.post(`/payroll/payments/${payment.id}/retry`);
      await fetchPayments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Retry failed');
    } finally {
      setRetryLoading(null);
    }
  };

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);
  const totalPending = payments.filter(p => p.status === 'pending' || p.status === 'processing').reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);
  const failedCount = payments.filter(p => p.status === 'failed').length;

  if (!runId) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Generate payslips first to see payment activity.</div>;
  }

  return (
    <>
      {markPaidTarget && <MarkManualPaidModal payment={markPaidTarget} onClose={() => setMarkPaidTarget(null)} onSuccess={fetchPayments} />}
      {reverseTarget && <ReversePaymentModal payment={reverseTarget} onClose={() => setReverseTarget(null)} onSuccess={fetchPayments} />}

      <div className="space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {payments.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Paid</p><p className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">In Progress</p><p className="text-2xl font-bold text-blue-600">{fmt(totalPending)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Failed</p><p className="text-2xl font-bold text-red-600">{failedCount}</p></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Payment Activity — {new Date(0, month - 1).toLocaleString('default', { month: 'long' })} {year}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : payments.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No payments initiated yet for this run.</div>
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.first_name} {p.last_name}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(p.amount ?? 0)}</TableCell>
                      <TableCell className="text-muted-foreground">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</TableCell>
                      <TableCell><PaymentStatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{p.transaction_reference ?? p.gateway_payout_id ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-IN') : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(p.status === 'pending' || p.status === 'processing') && p.payment_method !== 'razorpay' && (
                            <button onClick={() => setMarkPaidTarget(p)} title="Mark Paid"
                              className="p-1.5 rounded hover:bg-green-50 text-green-600">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {p.status === 'failed' && (
                            <button onClick={() => retry(p)} disabled={retryLoading === p.id} title="Retry"
                              className="p-1.5 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-40">
                              {retryLoading === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                            </button>
                          )}
                          {p.status === 'paid' && (
                            <button onClick={() => setReverseTarget(p)} title="Reverse"
                              className="p-1.5 rounded hover:bg-red-50 text-red-500">
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ── Payslips Tab ───────────────────────────────────────────────────────────────

function PayslipsTab({ month, year, onRunIdFound, onDataChanged }: {
  month: number; year: number; onRunIdFound: (id: string) => void; onDataChanged?: () => void;
}) {
  const canGenerate = useCan(PERMISSIONS.PAYROLL_CREATE);
  const canProcess = useCan(PERMISSIONS.PAYROLL_APPROVE);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [runId, setRunId] = useState('');
  const [generationResult, setGenerationResult] = useState<any | null>(null);
  const [initiateTarget, setInitiateTarget] = useState<any | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [payslipsRes, employeesRes] = await Promise.all([
        api.get('/payroll/payslips', { params: { month, year } }),
        api.get('/employees?limit=1000'),
      ]);
      const data = normalizeList(payslipsRes.data);
      setPayslips(data);
      setEmployees(normalizeList(employeesRes.data));
      const rid = data[0]?.payroll_run_id ?? '';
      setRunId(rid);
      onRunIdFound(rid);
    } catch {
      setError('Failed to load payslips');
    } finally {
      setLoading(false);
    }
  }, [month, year, onRunIdFound]);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  const generatePayslips = async () => {
    setGenerating(true);
    setError('');
    setGenerationResult(null);
    try {
      const res = await api.post('/payroll/runs/generate', { month, year });
      const result = res.data.data ?? res.data;
      setGenerationResult(result);
      if (result?.payroll_run_id) {
        setRunId(result.payroll_run_id);
        onRunIdFound(result.payroll_run_id);
      }
      await fetchPayslips();
      onDataChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Payroll cannot be generated yet. Review the readiness check for missing prerequisites.');
    } finally {
      setGenerating(false);
    }
  };

  const processPayroll = async () => {
    if (!runId) return;
    setProcessing(true);
    setError('');
    try {
      await api.post(`/payroll/runs/${runId}/process`);
      await fetchPayslips();
      onDataChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to process payroll run.');
    } finally {
      setProcessing(false);
    }
  };

  const totalPayroll = payslips.reduce((s, p) => s + parseFloat(p.net_salary || 0), 0);
  const totalDisbursed = payslips.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_salary || 0), 0);
  const totalOutstanding = totalPayroll - totalDisbursed;
  const unpaidCount = payslips.filter(p => p.status !== 'paid').length;
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const skippedRows = useMemo(() => (generationResult?.skipped ?? []).map((skip: any) => {
    const employee = employeeById.get(skip.employee_id);
    return {
      employeeId: skip.employee_id,
      employeeName: employee ? getEmployeeName(employee) : 'Unknown employee',
      employeeCode: employee?.employee_code ?? skip.employee_id,
      reason: getPayrollSkipReason(skip.reason),
    };
  }), [employeeById, generationResult]);

  return (
    <>
      {initiateTarget && <InitiatePaymentModal payslip={initiateTarget} onClose={() => setInitiateTarget(null)} onSuccess={() => { fetchPayslips(); onDataChanged?.(); }} />}
      {showBulkModal && runId && <BulkInitiateModal runId={runId} onClose={() => setShowBulkModal(false)} onSuccess={() => { fetchPayslips(); onDataChanged?.(); }} />}
      <AdminPayslipModal payslipId={viewPayslipId} onClose={() => setViewPayslipId(null)} />

      <div className="space-y-4">
        {runId && <BankValidationBanner runId={runId} />}

        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Payroll</p><p className="text-2xl font-bold">{fmt(totalPayroll)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Disbursed</p><p className="text-2xl font-bold text-green-700">{fmt(totalDisbursed)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold text-amber-700">{fmt(totalOutstanding)}</p></CardContent></Card>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        {skippedRows.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              Generated {generationResult.payslips?.length ?? 0} payslip{(generationResult.payslips?.length ?? 0) === 1 ? '' : 's'} and skipped {skippedRows.length}.
            </p>
            <div className="mt-3 space-y-2">
              {skippedRows.map((row: any) => (
                <div key={row.employeeId} className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-amber-950 truncate">{row.employeeName}</p>
                      <p className="text-xs text-amber-700">{row.employeeCode}</p>
                    </div>
                    <p className="text-xs text-amber-900 sm:max-w-md">{row.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {runId && unpaidCount > 0 && (
          <div className="flex gap-3 flex-wrap items-center">
            <Button onClick={() => setShowBulkModal(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <DollarSign className="w-4 h-4" />
              Bulk Pay ({unpaidCount})
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payslips — {new Date(0, month - 1).toLocaleString('default', { month: 'long' })} {year}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {canGenerate && (
                <Button onClick={generatePayslips} disabled={generating} className="gap-2">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Generate Payslips
                </Button>
              )}
              {runId && canProcess && payslips.length > 0 && payslips.some((p) => p.status === 'draft') && (
                <Button onClick={processPayroll} disabled={processing} className="gap-2 bg-blue-600 hover:bg-blue-700">
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Process Payroll
                </Button>
              )}
              <ExportButton
                config={{
                  module: 'payroll',
                  title: `Payroll ${new Date(0, month - 1).toLocaleString('default', { month: 'long' })} ${year}`,
                  permission: PERMISSIONS.PAYROLL_EXPORT,
                  columns: [
                    { key: 'employee_code', header: 'Employee Code' },
                    { key: 'employee_name', header: 'Employee Name' },
                    { key: 'branch_name', header: 'Branch' },
                    { key: 'department_name', header: 'Department' },
                    { key: 'month', header: 'Month', type: 'number' },
                    { key: 'year', header: 'Year', type: 'number' },
                    { key: 'basic_salary', header: 'Basic Salary', type: 'currency' },
                    { key: 'gross_salary', header: 'Gross Salary', type: 'currency' },
                    { key: 'total_deductions', header: 'Deductions', type: 'currency' },
                    { key: 'net_salary', header: 'Net Salary', type: 'currency' },
                    { key: 'status', header: 'Status' },
                  ],
                  defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'gross_salary', 'total_deductions', 'net_salary', 'status'],
                  filenamePrefix: `payroll_${year}_${month}`,
                }}
                filters={{ month, year }}
                currentPageData={payslips}
              />
              <ImportButton
                config={{
                  module: 'payroll',
                  title: 'Payroll',
                  permission: PERMISSIONS.PAYROLL_CREATE,
                }}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading…</p>
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-8 text-center">
                        <div className="max-w-md mx-auto">
                          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="font-medium">No payslips generated for this month.</p>
                          <p className="text-sm text-muted-foreground mt-1">Generate attendance summaries, approve them, lock payroll, then generate payslips from this screen.</p>
                          {canGenerate && (
                            <Button onClick={generatePayslips} disabled={generating} className="mt-4 gap-2">
                              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                              Generate Payslips
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    payslips.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{p.first_name} {p.last_name}</TableCell>
                        <TableCell className="text-right">{fmt(p.gross_salary)}</TableCell>
                        <TableCell className="text-right text-green-700">{fmt(p.overtime || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(p.total_deductions)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(p.net_salary)}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewPayslipId(p.id)}
                              title="View payslip"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {p.status !== 'paid' && (
                              <Button size="sm" onClick={() => setInitiateTarget(p)} className="gap-1.5">
                                <CreditCard className="w-3.5 h-3.5" /> Pay
                              </Button>
                            )}
                            {p.status === 'paid' && (
                              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Paid
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'payslips' | 'attendance-summary' | 'payments';

export default function PayrollPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [runId, setRunId] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewGenerating, setOverviewGenerating] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [overviewData, setOverviewData] = useState<PayrollOverviewData>({
    employees: [],
    summaries: [],
    payslips: [],
    payments: [],
    runId: '',
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'payslips', label: 'Payslips' },
    { id: 'attendance-summary', label: 'Attendance Summary' },
    { id: 'payments', label: 'Payments' },
  ];

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const [employeesRes, summariesRes, payslipsRes, runsRes] = await Promise.all([
        api.get('/employees?limit=1000').catch(() => ({ data: [] })),
        api.get('/payroll/attendance-summary', { params: { month, year } }).catch(() => ({ data: [] })),
        api.get('/payroll/payslips', { params: { month, year, limit: 1000 } }).catch(() => ({ data: [] })),
        api.get('/payroll/runs').catch(() => ({ data: [] })),
      ]);

      const employees = normalizeList(employeesRes.data);
      const summaries = normalizeList(summariesRes.data);
      const payslips = normalizeList(payslipsRes.data);
      const runs = normalizeList(runsRes.data);
      const matchingRun = payslips[0]?.payroll_run_id
        ? { id: payslips[0].payroll_run_id }
        : runs.find((run) => Number(run.month) === month && Number(run.year) === year);
      const nextRunId = matchingRun?.id ?? '';
      let payments: any[] = [];

      if (nextRunId) {
        const paymentsRes = await api.get(`/payroll/runs/${nextRunId}/payments`).catch(() => ({ data: [] }));
        payments = normalizeList(paymentsRes.data);
      }

      setRunId(nextRunId);
      setOverviewData({ employees, summaries, payslips, payments, runId: nextRunId });
    } finally {
      setOverviewLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const navigateTab = (tab: Tab) => {
    if (tab === 'overview') fetchOverview();
    setActiveTab(tab);
  };

  const generateFromOverview = async () => {
    setOverviewGenerating(true);
    setOverviewError('');
    try {
      const res = await api.post('/payroll/runs/generate', { month, year });
      const result = res.data.data ?? res.data;
      if (result?.payroll_run_id) setRunId(result.payroll_run_id);
      await fetchOverview();
      setActiveTab('payslips');
    } catch (err: any) {
      setOverviewError(err.response?.data?.message || err.response?.data?.error || 'Payroll cannot be generated yet. Fix readiness issues and try again.');
    } finally {
      setOverviewGenerating(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Payroll & Payslips</h1>
            <p className="text-muted-foreground">Finalize attendance, approve summaries, generate and pay payslips</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard/hr/payroll/bank-accounts')} className="gap-2">
            <Banknote className="w-4 h-4" /> Bank Accounts
          </Button>
        </div>

        <div className="flex gap-3 items-center">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border rounded-md px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded-md px-3 py-2 text-sm w-24" />
        </div>

        <div className="border-b border-border">
          <nav className="flex gap-1">
            {tabs.map(t => (
              <button key={t.id} onClick={() => navigateTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'overview' && (
          <WorkflowDashboard
            data={overviewData}
            month={month}
            year={year}
            loading={overviewLoading}
            onNavigate={navigateTab}
            onGenerate={generateFromOverview}
            generating={overviewGenerating}
            actionError={overviewError}
          />
        )}
        {activeTab === 'payslips' && (
          <PayslipsTab month={month} year={year} onRunIdFound={setRunId} onDataChanged={fetchOverview} />
        )}
        {activeTab === 'attendance-summary' && (
          <AttendanceSummaryTab month={month} year={year} />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab runId={runId} month={month} year={year} />
        )}
      </div>
    </>
  );
}
