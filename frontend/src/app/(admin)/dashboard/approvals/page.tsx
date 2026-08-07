'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApprovalsSocket } from '@/hooks/use-approvals-socket';
import { ApprovalInbox } from '@/components/approvals/approval-inbox';
import { approvalsApi } from '@/lib/approvals-api';
import api from '@/lib/api';
import {
  CheckSquare, Inbox, Send, BarChart3,
  TrendingDown, Clock, AlertTriangle, CheckCircle2,
  Timer, Plus, X, Check, RefreshCw, AlertCircle, Info,
  XCircle, Shield,
} from 'lucide-react';

type Tab = 'pending' | 'submitted' | 'history' | 'analytics';

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView() {
  const { data, isLoading } = useQuery({
    queryKey: ['approvals-analytics'],
    queryFn: () => approvalsApi.getAnalytics(),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-white p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const cards = [
    { label: 'Total Requests',     value: data.total,              icon: CheckSquare,  color: 'text-slate-700' },
    { label: 'Approved',           value: data.approved,           icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Rejected',           value: data.rejected,           icon: TrendingDown, color: 'text-red-600' },
    { label: 'Pending',            value: data.pending,            icon: Clock,        color: 'text-amber-600' },
    { label: 'SLA Breaches',       value: data.sla_breach_count,   icon: AlertTriangle,color: 'text-orange-600' },
    { label: 'Rejection Rate',     value: `${(Number(data.rejection_rate) * 100).toFixed(1)}%`, icon: TrendingDown, color: 'text-red-500' },
    {
      label: 'Avg Resolution',
      value: data.avg_resolution_hours != null
        ? `${Number(data.avg_resolution_hours).toFixed(1)}h`
        : '—',
      icon: Clock,
      color: 'text-blue-600',
    },
    { label: 'Expired',            value: data.expired,            icon: AlertTriangle,color: 'text-slate-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {data.by_workflow_type.length > 0 && (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">By Workflow Type</h3>
          </div>
          <div className="divide-y divide-border">
            {data.by_workflow_type.map((wf) => (
              <div key={wf.workflow_type} className="px-5 py-3 flex items-center gap-4">
                <span className="text-sm font-medium text-slate-700 w-40 flex-shrink-0 capitalize">
                  {wf.workflow_type.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 flex items-center gap-4 text-sm text-slate-500">
                  <span>{wf.total} total</span>
                  <span className="text-emerald-600">{wf.approved} approved</span>
                  <span className="text-red-600">{wf.rejected} rejected</span>
                  {wf.avg_hours != null && (
                    <span className="ml-auto text-xs text-blue-600">{Number(wf.avg_hours).toFixed(1)}h avg</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OT Request Modal ─────────────────────────────────────────────────────────

interface OtPolicy { ot_rate_multiplier?: number; ot_daily_cap_hours?: number }

function OtRequestModal({
  onClose,
  onSuccess,
  policy,
  myEmployeeId,
}: {
  onClose: () => void;
  onSuccess: () => void;
  policy: OtPolicy;
  myEmployeeId: string;
}) {
  const [form, setForm] = useState({
    ot_date: new Date().toISOString().split('T')[0],
    requested_hours: '',
    reason: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const dailyCap = policy?.ot_daily_cap_hours;
  const multiplier = policy?.ot_rate_multiplier ?? 1.5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const hours = parseFloat(form.requested_hours);
    if (!form.reason.trim()) { setError('Reason is required'); return; }
    if (!hours || hours <= 0) { setError('Enter valid hours (e.g. 2.5)'); return; }
    if (dailyCap && hours > dailyCap) { setError(`Exceeds daily cap of ${dailyCap} hrs`); return; }

    setSaving(true);
    try {
      await api.post('/overtime/requests', {
        employee_id: myEmployeeId,
        ot_date: form.ot_date,
        requested_hours: hours,
        reason: form.reason.trim(),
        notes: form.notes.trim() || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Timer className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Request Overtime</h3>
              <p className="text-[11px] text-slate-400">Submitted for manager / HR approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Policy banner */}
        <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            OT rate: <strong>{multiplier}×</strong> hourly rate
            {dailyCap ? ` · Daily cap: ${dailyCap} hrs` : ''}
            {' · Requires manager/HR approval before payroll'}
          </p>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3.5">
          {/* Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">OT Date <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={form.ot_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => set('ot_date', e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Hours */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Requested Hours <span className="text-red-400">*</span>
              {dailyCap && <span className="ml-1 text-[10px] text-slate-400 font-normal">max {dailyCap} hrs</span>}
            </label>
            <input
              type="number" step="0.5" min="0.5" max={dailyCap ?? 12}
              value={form.requested_hours}
              onChange={e => set('requested_hours', e.target.value)}
              placeholder="e.g. 2.5"
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Reason / Justification <span className="text-red-400">*</span></label>
            <textarea
              value={form.reason}
              onChange={e => set('reason', e.target.value)}
              rows={3}
              placeholder="Describe why overtime was required…"
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Supporting Notes <span className="text-[10px] text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="Project, task reference, additional context…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── OT Quick-Action Bar ──────────────────────────────────────────────────────
// Shown at the top of the approvals page when the logged-in user is OT-eligible.
// Allows submitting an OT request directly from the approvals module.

function OtActionBar({ onSubmitted }: { onSubmitted: () => void }) {
  const [eligibility, setEligibility] = useState<{ eligible: boolean; policy: any } | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.get('/auth/me').then((r: any) => {
      const u = r.data?.data ?? r.data;
      const eid = u?.employee_id || u?.employeeId;
      if (!eid) return;
      setMyEmployeeId(eid);
      api.get(`/overtime/eligibility/${eid}`)
        .then((res: any) => setEligibility(res.data?.data ?? null))
        .catch(() => setEligibility({ eligible: false, policy: null }));
    }).catch(() => {});
  }, []);

  // Only render the bar when we know the eligibility result
  if (eligibility === null) return null;

  return (
    <>
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
        eligibility.eligible
          ? 'bg-amber-50 border-amber-200'
          : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <Timer className={`w-4 h-4 ${eligibility.eligible ? 'text-amber-500' : 'text-slate-400'}`} />
          {eligibility.eligible ? (
            <div>
              <span className="text-xs font-semibold text-amber-700">Overtime Eligible</span>
              <span className="text-[11px] text-amber-600 ml-2">
                {eligibility.policy?.ot_rate_multiplier ?? 1.5}× rate
                {eligibility.policy?.ot_daily_cap_hours ? ` · cap ${eligibility.policy.ot_daily_cap_hours} hrs/day` : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">No overtime policy assigned — contact HR to request eligibility</span>
            </div>
          )}
        </div>

        {eligibility.eligible && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Request OT
          </button>
        )}
      </div>

      {showModal && eligibility.eligible && myEmployeeId && (
        <OtRequestModal
          policy={eligibility.policy ?? {}}
          myEmployeeId={myEmployeeId}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            onSubmitted();
          }}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VALID_TABS: Tab[] = ['pending', 'submitted', 'history', 'analytics'];

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsPageContent />
    </Suspense>
  );
}

function ApprovalsPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get('tab') ?? '';
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'pending');
  // Used to trigger re-fetch of submitted list after an OT request is submitted
  const [submittedKey, setSubmittedKey] = useState(0);

  useApprovalsSocket();

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'pending',   label: 'Inbox',     icon: Inbox },
    { key: 'submitted', label: 'Submitted',  icon: Send },
    { key: 'history',   label: 'History',    icon: Clock },
    { key: 'analytics', label: 'Analytics',  icon: BarChart3 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0">
          <CheckSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Approvals</h1>
          <p className="text-xs text-muted-foreground">Review and manage approval requests across all workflows</p>
        </div>
      </div>

      {/* OT action bar — visible on Inbox and Submitted tabs */}
      {tab !== 'analytics' && (
        <OtActionBar
          onSubmitted={() => {
            setTab('submitted');
            setSubmittedKey(k => k + 1);
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'pending'      && <ApprovalInbox mode="inbox" />}
      {tab === 'submitted'    && <ApprovalInbox key={submittedKey} mode="submitted" />}
      {tab === 'history'      && <ApprovalInbox mode="history" />}
      {tab === 'analytics'    && <AnalyticsView />}

      {/* Payroll-safe note */}
      {tab !== 'analytics' && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
          <Shield className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-blue-600 leading-relaxed">
            <span className="font-semibold">Payroll-safe: </span>
            Overtime payments only enter payroll after full approval. Pending and rejected OT requests are excluded from all salary calculations.
          </p>
        </div>
      )}
    </div>
  );
}
