'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Plus, RefreshCw, CreditCard, Search, X, Loader2, CheckCircle2, Upload } from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { ApprovalReasonModal } from '@/components/approvals/approval-reason-modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
};

const CATEGORIES = ['travel', 'food', 'accommodation', 'supplies', 'utilities', 'maintenance', 'marketing', 'salary', 'other'];

/* ── Add Expense Drawer ─────────────────────────────────────────────────── */
function AddExpenseDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ category: 'other', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt_url: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.amount || parseFloat(form.amount) <= 0) e.amount = 'Enter a valid amount greater than zero';
    if (!form.category) e.category = 'Category is required';
    if (!form.date) e.date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try { await api.post('/finance/expenses', form); onSaved(); onClose(); }
    catch (e: any) { setErrors({ _: e.response?.data?.message || 'Failed to save expense' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add Expense</h2>
            <p className="text-xs text-muted-foreground">Log a new employee expense</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category <span className="text-red-500">*</span></label>
            <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.category ? 'border-red-400' : 'border-border'}`}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Amount (₹) <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.amount ? 'border-red-400' : 'border-border'}`} />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.date ? 'border-red-400' : 'border-border'}`} />
            {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was this expense for?" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Receipt URL</label>
            <input type="url" value={form.receipt_url} onChange={(e) => setForm(f => ({ ...f, receipt_url: e.target.value }))} placeholder="https://…" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Save Expense
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ open: boolean; action: 'approve' | 'reject'; id: string; title: string }>({
    open: false, action: 'approve', id: '', title: '',
  });

  const EXPENSE_BULK_COLUMNS = [
    { key: 'category', label: 'Category', required: true, type: 'select' as const, options: CATEGORIES, width: '130px' },
    { key: 'amount', label: 'Amount (₹)', required: true, type: 'number' as const, placeholder: '0', width: '110px' },
    { key: 'date', label: 'Date', required: true, type: 'date' as const, defaultValue: new Date().toISOString().split('T')[0], width: '130px' },
    { key: 'description', label: 'Description', placeholder: 'What was this expense for?', width: '200px' },
    { key: 'receipt_url', label: 'Receipt URL', placeholder: 'https://...', width: '150px' },
  ];

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (activeStatus !== 'all') params.status = activeStatus;
      if (category) params.category = category;
      const res = await api.get('/finance/expenses', { params });
      setExpenses(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeStatus, category]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const filtered = search ? expenses.filter(e => `${e.first_name} ${e.last_name} ${e.description} ${e.category}`.toLowerCase().includes(search.toLowerCase())) : expenses;

  const openApprove = (e: any) =>
    setReasonModal({ open: true, action: 'approve', id: e.id, title: `Expense: ${e.first_name ?? ''} ${e.last_name ?? ''} — ${e.category} ${fmt(e.amount)}` });
  const openReject = (e: any) =>
    setReasonModal({ open: true, action: 'reject', id: e.id, title: `Expense: ${e.first_name ?? ''} ${e.last_name ?? ''} — ${e.category} ${fmt(e.amount)}` });

  const handleExpenseConfirm = async (reason: string) => {
    const { action, id } = reasonModal;
    await api.post(`/finance/expenses/${id}/${action}`, { reason });
    fetchExpenses();
  };

  const exportCsv = () => {
    const rows = [['Employee', 'Category', 'Date', 'Amount', 'Description', 'Status']];
    for (const e of filtered) {
      rows.push([
        e.first_name ? `${e.first_name} ${e.last_name}` : '—',
        e.category, new Date(e.date).toLocaleDateString('en-IN'),
        parseFloat(e.amount).toFixed(2), e.description || '', e.status,
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + parseFloat(e.amount), 0);

  return (
    <>
      {showAdd && <AddExpenseDrawer onClose={() => setShowAdd(false)} onSaved={fetchExpenses} />}
      <ApprovalReasonModal
        isOpen={reasonModal.open}
        action={reasonModal.action}
        requestTitle={reasonModal.title}
        onConfirm={handleExpenseConfirm}
        onClose={() => setReasonModal((m) => ({ ...m, open: false }))}
      />
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Expenses"
          subtitle="Log multiple expenses at once"
          columns={EXPENSE_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/expenses', { ...row, amount: parseFloat(row.amount) })}
          onAllDone={fetchExpenses}
        />
      )}
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Expenses</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Employee expense tracking and approvals</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">Export CSV</button>
            <button onClick={fetchExpenses} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-emerald-700 mb-1">Approved Total</p>
            <p className="text-xl font-bold text-emerald-800">{fmt(totalApproved)}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs font-medium text-amber-700 mb-1">Pending Approval</p>
            <p className="text-xl font-bold text-amber-800">{fmt(totalPending)}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
            {['all', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => setActiveStatus(s)} className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${activeStatus === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{s}</button>
            ))}
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No expenses found</p>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    {['Employee','Category','Date','Amount','Description','Status','Actions'].map(h => (
                      <TableHead key={h} className={`p-3 font-medium text-muted-foreground ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="p-3 font-medium text-foreground">{e.first_name ? `${e.first_name} ${e.last_name}` : '—'}</TableCell>
                      <TableCell className="p-3 capitalize text-muted-foreground">{e.category}</TableCell>
                      <TableCell className="p-3 text-muted-foreground">{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell className="p-3 text-right font-semibold">{fmt(e.amount)}</TableCell>
                      <TableCell className="p-3 max-w-[180px] truncate text-muted-foreground">{e.description || '—'}</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[e.status] || 'bg-muted text-muted-foreground'}`}>{e.status}</span>
                      </TableCell>
                      <TableCell className="p-3">
                        {e.status === 'pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => openApprove(e)} className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3" /> Approve</button>
                            <button onClick={() => openReject(e)} className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-100"><X className="w-3 h-3" /> Reject</button>
                          </div>
                        )}
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
