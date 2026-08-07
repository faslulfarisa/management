'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Plus, RefreshCw, Wallet, X, Loader2, TrendingUp, TrendingDown, Upload } from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const CATEGORIES = ['sales', 'service', 'rent', 'salary', 'utilities', 'purchase', 'maintenance', 'petty', 'misc'];

/* ── Add Entry Drawer ──────────────────────────────────────────────────── */
function AddEntryDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    entry_type: 'receipt', entry_date: new Date().toISOString().split('T')[0],
    category: 'misc', description: '', reference: '', amount: '', account: 'main',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.amount || parseFloat(form.amount) <= 0) e.amount = 'Enter a valid amount greater than zero';
    if (!form.entry_date) e.entry_date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try { await api.post('/finance/cashbook', { ...form, amount: parseFloat(form.amount) }); onSaved(); onClose(); }
    catch (e: any) { setErrors({ _: e.response?.data?.message || 'Failed to save entry' }); }
    finally { setSaving(false); }
  };

  const isReceipt = form.entry_type === 'receipt';

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">New Cashbook Entry</h2>
            <p className="text-xs text-muted-foreground">Record a cash receipt or payment</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Entry Type <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {['receipt', 'payment'].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, entry_type: t }))} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${form.entry_type === t ? (t === 'receipt' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'border border-border text-muted-foreground hover:bg-muted'}`}>
                  {t === 'receipt' ? '↑ Receipt' : '↓ Payment'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.entry_date} onChange={(e) => setForm(f => ({ ...f, entry_date: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.entry_date ? 'border-red-400' : 'border-border'}`} />
            {errors.entry_date && <p className="text-xs text-red-500 mt-1">{errors.entry_date}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Amount (₹) <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.amount ? 'border-red-400' : 'border-border'}`} />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Room service payment" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reference</label>
            <input value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Cheque / UTR number" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className={`text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 ${isReceipt ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isReceipt ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />)} Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function CashbookPage() {
  const [data, setData] = useState<any>({ entries: [], summary: { total_receipts: 0, total_payments: 0 } });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const CASHBOOK_BULK_COLUMNS = [
    { key: 'entry_type', label: 'Type', required: true, type: 'select' as const, options: ['receipt', 'payment'], defaultValue: 'receipt', width: '110px' },
    { key: 'entry_date', label: 'Date', required: true, type: 'date' as const, defaultValue: new Date().toISOString().split('T')[0], width: '130px' },
    { key: 'category', label: 'Category', required: true, type: 'select' as const, options: CATEGORIES, defaultValue: 'misc', width: '120px' },
    { key: 'description', label: 'Description', required: true, placeholder: 'Brief description', width: '180px' },
    { key: 'amount', label: 'Amount (₹)', required: true, type: 'number' as const, placeholder: '0', width: '110px' },
    { key: 'reference', label: 'Reference', placeholder: 'Cheque/Ref no.', width: '130px' },
    { key: 'account', label: 'Account', type: 'select' as const, options: ['main', 'petty_cash', 'bank'], defaultValue: 'main', width: '110px' },
  ];

  const [typeFilter, setTypeFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/cashbook');
      setData(res.data.data || { entries: [], summary: {} });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const entries = typeFilter === 'all' ? data.entries : data.entries.filter((e: any) => e.entry_type === typeFilter);
  const balance = parseFloat(data.summary?.total_receipts || 0) - parseFloat(data.summary?.total_payments || 0);

  // Running balance (compute from bottom to top)
  let runBal = balance;
  const withBalance = [...entries].map((e: any) => {
    const entry = { ...e, running_balance: runBal };
    if (e.entry_type === 'receipt') runBal -= parseFloat(e.amount);
    else runBal += parseFloat(e.amount);
    return entry;
  });

  return (
    <>
      {showAdd && <AddEntryDrawer onClose={() => setShowAdd(false)} onSaved={fetchData} />}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Cashbook Entries"
          subtitle="Import multiple cash/bank transactions at once"
          columns={CASHBOOK_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/cashbook', { ...row, amount: parseFloat(row.amount) })}
          onAllDone={fetchData}
        />
      )}
      <div className="space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Cashbook</h1>
            <p className="text-sm text-muted-foreground">Bank & cash ledger with running balance</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> New Entry
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <p className="text-xs font-medium text-muted-foreground">Total Receipts</p>
            </div>
            <p className="text-lg font-bold text-emerald-700">{fmt(data.summary?.total_receipts || 0)}</p>
          </div>
          <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><TrendingDown className="w-4 h-4 text-rose-600" /></div>
              <p className="text-xs font-medium text-muted-foreground">Total Payments</p>
            </div>
            <p className="text-lg font-bold text-rose-700">{fmt(data.summary?.total_payments || 0)}</p>
          </div>
          <div className={`border rounded-2xl p-4 shadow-sm ${balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${balance >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}><Wallet className={`w-4 h-4 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`} /></div>
              <p className="text-xs font-medium text-muted-foreground">Net Balance</p>
            </div>
            <p className={`text-lg font-bold ${balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>{fmt(balance)}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
          {['all', 'receipt', 'payment'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1.5 text-sm font-medium rounded-lg capitalize transition-all ${typeFilter === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>

        {/* Ledger Table */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Wallet className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">No cashbook entries yet</p>
              <button onClick={() => setShowAdd(true)} className="mt-4 text-xs text-primary hover:underline font-medium">Add your first entry →</button>
            </div>
          ) : (
            <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Date</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Type</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Category</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Description</TableHead>
                    <TableHead className="text-left p-3 font-medium text-muted-foreground">Reference</TableHead>
                    <TableHead className="text-right p-3 font-medium text-emerald-700">Credit (+)</TableHead>
                    <TableHead className="text-right p-3 font-medium text-rose-700">Debit (−)</TableHead>
                    <TableHead className="text-right p-3 font-medium text-muted-foreground">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withBalance.map((e: any) => (
                    <TableRow key={e.id} className={e.entry_type === 'receipt' ? 'hover:bg-emerald-50/30' : 'hover:bg-rose-50/30'}>
                      <TableCell className="p-3 text-muted-foreground text-xs">{new Date(e.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell className="p-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${e.entry_type === 'receipt' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          {e.entry_type === 'receipt' ? '↑ ' : '↓ '}{e.entry_type}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 capitalize text-muted-foreground">{e.category}</TableCell>
                      <TableCell className="p-3 text-foreground max-w-[150px] truncate">{e.description || '—'}</TableCell>
                      <TableCell className="p-3 font-mono text-xs text-muted-foreground">{e.reference || '—'}</TableCell>
                      <TableCell className="p-3 text-right font-semibold text-emerald-700">{e.entry_type === 'receipt' ? fmt(e.amount) : ''}</TableCell>
                      <TableCell className="p-3 text-right font-semibold text-rose-700">{e.entry_type === 'payment' ? fmt(e.amount) : ''}</TableCell>
                      <TableCell className="p-3 text-right font-bold text-foreground">{fmt(e.running_balance)}</TableCell>
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
