'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Plus, RefreshCw, Receipt, Search, X, Loader2, CheckCircle2,
  XCircle, Banknote, Clock, TrendingUp, FileText, Download, Upload,
} from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { ApprovalReasonModal } from '@/components/approvals/approval-reason-modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  paid:     'bg-blue-50 text-blue-700 border border-blue-200',
};

const CATEGORIES = [
  { value: 'food',          label: 'Food & Meals',    emoji: '🍽️' },
  { value: 'travel',        label: 'Travel',           emoji: '✈️' },
  { value: 'accommodation', label: 'Accommodation',    emoji: '🏨' },
  { value: 'fuel',          label: 'Fuel',             emoji: '⛽' },
  { value: 'medical',       label: 'Medical',          emoji: '🏥' },
  { value: 'telephone',     label: 'Telephone',        emoji: '📱' },
  { value: 'uniform',       label: 'Uniform',          emoji: '👔' },
  { value: 'other',         label: 'Other',            emoji: '📋' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, gradient }: {
  label: string; value: string; sub?: string; icon: React.ElementType; gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm font-medium opacity-90 mt-0.5">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Add Reimbursement Drawer ───────────────────────────────────────────── */
function AddReimbursementDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    category: 'food',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    receipt_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.category) e.category = 'Please select a category';
    if (!form.amount || parseFloat(form.amount) <= 0) e.amount = 'Enter a valid amount greater than zero';
    if (!form.expense_date) e.expense_date = 'Expense date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/finance/reimbursements', form);
      onSaved();
      onClose();
    } catch (e: any) {
      setErrors({ _: e.response?.data?.message || 'Failed to submit reimbursement' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">New Reimbursement</h2>
              <p className="text-xs text-white/70">Submit an expense claim</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">Category <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, category: c.value }))}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.category === c.value
                      ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm'
                      : 'border-border hover:border-teal-300 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-lg">{c.emoji}</span>
                  <span className="truncate w-full text-center">{c.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Amount (₹) <span className="text-red-500">*</span></label>
              <input
                type="number" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 ${errors.amount ? 'border-red-400' : 'border-border'}`}
              />
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Expense Date <span className="text-red-500">*</span></label>
              <input
                type="date" value={form.expense_date}
                onChange={(e) => setForm(f => ({ ...f, expense_date: e.target.value }))}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 ${errors.expense_date ? 'border-red-400' : 'border-border'}`}
              />
              {errors.expense_date && <p className="text-xs text-red-500 mt-1">{errors.expense_date}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief details about this expense…"
              rows={3}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Receipt URL <span className="text-muted-foreground/50 font-normal">(optional)</span></label>
            <input
              type="url" value={form.receipt_url}
              onChange={(e) => setForm(f => ({ ...f, receipt_url: e.target.value }))}
              placeholder="https://drive.google.com/…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={save} disabled={saving}
            className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-500/25 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Submit Claim
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ReimbursementsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const REIMB_BULK_COLUMNS = [
    { key: 'category', label: 'Category', required: true, type: 'select' as const, options: CATEGORIES.map(c => c.value), defaultValue: 'other', width: '130px' },
    { key: 'amount', label: 'Amount (₹)', required: true, type: 'number' as const, placeholder: '0', width: '110px' },
    { key: 'date', label: 'Date', required: true, type: 'date' as const, defaultValue: new Date().toISOString().split('T')[0], width: '130px' },
    { key: 'description', label: 'Description', required: true, placeholder: 'What was the expense?', width: '200px' },
    { key: 'receipt_url', label: 'Receipt URL', placeholder: 'https://...', width: '150px' },
  ];
  const [reasonModal, setReasonModal] = useState<{ open: boolean; action: 'approve' | 'reject'; id: string; title: string }>({
    open: false, action: 'approve', id: '', title: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (category) params.category = category;
      const [listRes, summaryRes] = await Promise.all([
        api.get('/finance/reimbursements', { params }),
        api.get('/finance/reimbursements/summary'),
      ]);
      setItems(listRes.data.data || []);
      setSummary(summaryRes.data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeStatus, category]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = search
    ? items.filter(r =>
        `${r.first_name} ${r.last_name} ${r.claim_number} ${r.description} ${r.category}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : items;

  const openApprove = (r: any) =>
    setReasonModal({ open: true, action: 'approve', id: r.id, title: `Reimbursement: ${r.claim_number ?? ''} — ${r.category} ${fmt(r.amount)}` });
  const openReject = (r: any) =>
    setReasonModal({ open: true, action: 'reject', id: r.id, title: `Reimbursement: ${r.claim_number ?? ''} — ${r.category} ${fmt(r.amount)}` });

  const handleReimbConfirm = async (reason: string) => {
    const { action, id } = reasonModal;
    await api.post(`/finance/reimbursements/${id}/${action}`, { reason });
    fetchData();
  };
  const markPaid = async (id: string) => {
    try { await api.post(`/finance/reimbursements/${id}/mark-paid`); fetchData(); }
    catch { alert('Failed to mark paid'); }
  };

  const exportCsv = () => {
    const rows = [['Employee', 'Claim #', 'Category', 'Expense Date', 'Amount', 'Description', 'Status']];
    for (const r of filtered) {
      rows.push([
        r.first_name ? `${r.first_name} ${r.last_name}` : '—',
        r.claim_number,
        CATEGORY_MAP[r.category]?.label || r.category,
        new Date(r.expense_date).toLocaleDateString('en-IN'),
        parseFloat(r.amount).toFixed(2),
        r.description || '',
        r.status,
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `reimbursements_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <>
      {showAdd && <AddReimbursementDrawer onClose={() => setShowAdd(false)} onSaved={fetchData} />}
      <ApprovalReasonModal
        isOpen={reasonModal.open}
        action={reasonModal.action}
        requestTitle={reasonModal.title}
        onConfirm={handleReimbConfirm}
        onClose={() => setReasonModal((m) => ({ ...m, open: false }))}
      />
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Reimbursements"
          subtitle="Submit multiple reimbursement claims at once"
          columns={REIMB_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/reimbursements', { ...row, amount: parseFloat(row.amount) })}
          onAllDone={fetchData}
        />
      )}

      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reimbursements</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Employee allowance & expense claims</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowBulkDrawer(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
            >
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:from-teal-600 hover:to-emerald-600 shadow-lg shadow-teal-500/25 transition-all"
            >
              <Plus className="w-4 h-4" /> New Claim
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="Total Claimed"
              value={fmt(summary.total_claimed)}
              sub={`${summary.total_claims} claims`}
              icon={FileText}
              gradient="bg-gradient-to-br from-slate-700 to-slate-800"
            />
            <KpiCard
              label="Pending"
              value={fmt(summary.total_pending)}
              sub={`${summary.pending_count} awaiting`}
              icon={Clock}
              gradient="bg-gradient-to-br from-amber-500 to-orange-500"
            />
            <KpiCard
              label="Approved"
              value={fmt(summary.total_approved)}
              sub={`${summary.approved_count} approved`}
              icon={TrendingUp}
              gradient="bg-gradient-to-br from-emerald-500 to-teal-500"
            />
            <KpiCard
              label="Paid Out"
              value={fmt(summary.total_paid)}
              sub={`${summary.paid_count} disbursed`}
              icon={Banknote}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-500"
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {['all', 'pending', 'approved', 'rejected', 'paid'].map(s => (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${
                  activeStatus === s
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
            ))}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search claims…"
              className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Receipt className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No reimbursement claims found</p>
              <p className="text-xs mt-1 opacity-60">Submit a new claim to get started</p>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    {['Employee', 'Claim #', 'Category', 'Expense Date', 'Amount', 'Description', 'Status', 'Actions'].map(h => (
                      <TableHead
                        key={h}
                        className={`p-3 font-medium text-muted-foreground ${h === 'Amount' ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="p-3 font-medium text-foreground whitespace-nowrap">
                        {r.first_name ? `${r.first_name} ${r.last_name}` : '—'}
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground font-mono text-xs">{r.claim_number}</TableCell>
                      <TableCell className="p-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span>{CATEGORY_MAP[r.category]?.emoji || '📋'}</span>
                          <span className="capitalize">{CATEGORY_MAP[r.category]?.label || r.category}</span>
                        </span>
                      </TableCell>
                      <TableCell className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(r.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="p-3 text-right font-semibold whitespace-nowrap">{fmt(r.amount)}</TableCell>
                      <TableCell className="p-3 max-w-[180px] truncate text-muted-foreground">{r.description || '—'}</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[r.status] || 'bg-muted text-muted-foreground'}`}>
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex gap-1">
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => openApprove(r)}
                                className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-100 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => openReject(r)}
                                className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-100 transition-colors"
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                          {r.status === 'approved' && (
                            <button
                              onClick={() => markPaid(r.id)}
                              className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-100 transition-colors"
                            >
                              <Banknote className="w-3 h-3" /> Mark Paid
                            </button>
                          )}
                          {r.status === 'rejected' && r.rejection_reason && (
                            <span className="text-xs text-red-500 italic max-w-[120px] truncate" title={r.rejection_reason}>
                              {r.rejection_reason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </div>
      </div>
    </>
  );
}
