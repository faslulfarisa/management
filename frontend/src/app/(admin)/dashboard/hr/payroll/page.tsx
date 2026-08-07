'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { AdminPayslipModal } from '@/components/payslips/admin-payslip-modal';
import { AttendanceSummaryTab } from '@/components/payroll/attendance-summary-tab';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
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

  const submit = async () => {
    setError('');
    if (!form.transaction_reference.trim()) { setError('Transaction reference is required'); return; }
    if (!form.payment_date) { setError('Payment date is required'); return; }
    setSaving(true);
    try {
      await api.patch(`/payroll/payments/${payment.id}/mark-paid`, form);
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
          <DialogDescription>Enter transaction details to mark as paid</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">UTR / Reference No. <span className="text-red-500">*</span></label>
            <input value={form.transaction_reference} onChange={e => setForm(f => ({ ...f, transaction_reference: e.target.value }))}
              placeholder="UTR123456789" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
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

function PayslipsTab({ month, year, onRunIdFound }: {
  month: number; year: number; onRunIdFound: (id: string) => void;
}) {
  const canGenerate = useCan(PERMISSIONS.PAYROLL_CREATE);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState('');
  const [initiateTarget, setInitiateTarget] = useState<any | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Payslips are (re)generated automatically for the selected period —
      // generation is an upsert keyed on employee/month/year, so this is safe to repeat.
      if (canGenerate) await api.post('/payroll/runs/generate', { month, year }).catch(() => {});
      const res = await api.get('/payroll/payslips', { params: { month, year } });
      const data = res.data.data ?? [];
      setPayslips(data);
      const rid = data[0]?.payroll_run_id ?? '';
      if (rid) { setRunId(rid); onRunIdFound(rid); }
    } catch {
      setError('Failed to load payslips');
    } finally {
      setLoading(false);
    }
  }, [month, year, onRunIdFound, canGenerate]);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  const totalPayroll = payslips.reduce((s, p) => s + parseFloat(p.net_salary || 0), 0);
  const totalDisbursed = payslips.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_salary || 0), 0);
  const totalOutstanding = totalPayroll - totalDisbursed;
  const unpaidCount = payslips.filter(p => p.status !== 'paid').length;

  return (
    <>
      {initiateTarget && <InitiatePaymentModal payslip={initiateTarget} onClose={() => setInitiateTarget(null)} onSuccess={fetchPayslips} />}
      {showBulkModal && runId && <BulkInitiateModal runId={runId} onClose={() => setShowBulkModal(false)} onSuccess={fetchPayslips} />}
      <AdminPayslipModal payslipId={viewPayslipId} onClose={() => setViewPayslipId(null)} />

      <div className="space-y-4">
        {runId && <BankValidationBanner runId={runId} />}

        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Payroll</p><p className="text-2xl font-bold">{fmt(totalPayroll)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Disbursed</p><p className="text-2xl font-bold text-green-700">{fmt(totalDisbursed)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold text-amber-700">{fmt(totalOutstanding)}</p></CardContent></Card>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {runId && unpaidCount > 0 && (
          <div className="flex gap-3 flex-wrap items-center">
            <Button onClick={() => setShowBulkModal(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <DollarSign className="w-4 h-4" />
              Bulk Pay ({unpaidCount})
            </Button>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Payslips — {new Date(0, month - 1).toLocaleString('default', { month: 'long' })} {year}</CardTitle></CardHeader>
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
                    <TableRow><TableCell colSpan={7} className="p-8 text-center text-muted-foreground">No payslips generated</TableCell></TableRow>
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

type Tab = 'payslips' | 'attendance-summary' | 'payments';

export default function PayrollPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('payslips');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [runId, setRunId] = useState('');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'payslips', label: 'Payslips' },
    { id: 'attendance-summary', label: 'Attendance Summary' },
    { id: 'payments', label: 'Payments' },
  ];

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
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'payslips' && (
          <PayslipsTab month={month} year={year} onRunIdFound={setRunId} />
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
