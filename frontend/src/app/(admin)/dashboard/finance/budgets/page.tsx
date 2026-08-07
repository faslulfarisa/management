'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Plus, RefreshCw, BarChart3, X, Loader2, Target, Upload } from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';

const fmt = (n: any) => `₹${(parseFloat(String(n)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const DEPARTMENTS = ['Front Office', 'Housekeeping', 'Food & Beverage', 'Kitchen', 'Engineering', 'Sales & Marketing', 'Human Resources', 'Finance & Accounts', 'Security', 'Spa & Wellness'];
const CATEGORIES = ['travel', 'food', 'supplies', 'utilities', 'maintenance', 'marketing', 'salary', 'capex', 'other'];

/* ── Budget Card ──────────────────────────────────────────────────────── */
function BudgetCard({ budget }: { budget: any }) {
  const allocated = parseFloat(budget.allocated) || 0;
  const utilized = parseFloat(budget.utilized) || 0;
  const pct = allocated > 0 ? Math.min((utilized / allocated) * 100, 100) : 0;
  const remaining = allocated - utilized;
  const isOver = utilized > allocated;

  const getColor = () => {
    if (isOver) return 'bg-red-500';
    if (pct > 80) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className={`bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md ${isOver ? 'border-red-200' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{budget.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {budget.department && <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{budget.department}</span>}
            {budget.category && <span className="text-[11px] text-muted-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded capitalize">{budget.category}</span>}
          </div>
        </div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOver ? 'bg-red-100' : 'bg-primary/10'}`}>
          <Target className={`w-4 h-4 ${isOver ? 'text-red-600' : 'text-primary'}`} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-500 ${getColor()}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div>
          <p className="text-muted-foreground">Utilized</p>
          <p className={`font-bold text-sm mt-0.5 ${isOver ? 'text-red-600' : 'text-foreground'}`}>{fmt(utilized)}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Allocated</p>
          <p className="font-bold text-sm mt-0.5 text-foreground">{fmt(allocated)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">{isOver ? 'Over by' : 'Remaining'}</p>
          <p className={`font-bold text-sm mt-0.5 ${isOver ? 'text-red-600' : 'text-emerald-700'}`}>{fmt(Math.abs(remaining))}</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {new Date(budget.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} –{' '}
          {new Date(budget.period_end).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
        </span>
        <span className={`text-xs font-bold ${isOver ? 'text-red-600' : pct > 80 ? 'text-amber-600' : 'text-emerald-700'}`}>
          {pct.toFixed(0)}% used
        </span>
      </div>
    </div>
  );
}

/* ── Add Budget Drawer ─────────────────────────────────────────────────── */
function AddBudgetDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [form, setForm] = useState({
    name: '', department: '', category: 'other', period_start: firstDay, period_end: lastDay, allocated: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Budget name is required';
    if (!form.allocated || parseFloat(form.allocated) <= 0) e.allocated = 'Enter a valid allocated amount greater than zero';
    if (!form.period_start) e.period_start = 'Period start date is required';
    if (!form.period_end) e.period_end = 'Period end date is required';
    if (form.period_start && form.period_end && form.period_start > form.period_end) e.period_end = 'End date must be after start date';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try { await api.post('/finance/budgets', { ...form, allocated: parseFloat(form.allocated) }); onSaved(); onClose(); }
    catch (e: any) { setErrors({ _: e.response?.data?.message || 'Failed to create budget' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Create Budget</h2>
            <p className="text-xs text-muted-foreground">Set up a new department or category budget</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Budget Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q1 Marketing Budget" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Department</label>
              <select value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">All</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Allocated Amount (₹) <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={form.allocated} onChange={(e) => setForm(f => ({ ...f, allocated: e.target.value }))} placeholder="0" className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.allocated ? 'border-red-400' : 'border-border'}`} />
            {errors.allocated && <p className="text-xs text-red-500 mt-1">{errors.allocated}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Period Start <span className="text-red-500">*</span></label>
              <input type="date" value={form.period_start} onChange={(e) => setForm(f => ({ ...f, period_start: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.period_start ? 'border-red-400' : 'border-border'}`} />
              {errors.period_start && <p className="text-xs text-red-500 mt-1">{errors.period_start}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Period End <span className="text-red-500">*</span></label>
              <input type="date" value={form.period_end} onChange={(e) => setForm(f => ({ ...f, period_end: e.target.value }))} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.period_end ? 'border-red-400' : 'border-border'}`} />
              {errors.period_end && <p className="text-xs text-red-500 mt-1">{errors.period_end}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Optional notes about this budget…" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />} Create Budget
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);

  const BUDGET_BULK_COLUMNS = [
    { key: 'name', label: 'Budget Name', required: true, placeholder: 'Q1 Marketing Budget', width: '180px' },
    { key: 'department', label: 'Department', type: 'select' as const, options: DEPARTMENTS, width: '160px' },
    { key: 'category', label: 'Category', type: 'select' as const, options: CATEGORIES, defaultValue: 'other', width: '120px' },
    { key: 'allocated', label: 'Allocated (₹)', required: true, type: 'number' as const, placeholder: '0', width: '120px' },
    { key: 'period_start', label: 'Period Start', required: true, type: 'date' as const, width: '130px' },
    { key: 'period_end', label: 'Period End', required: true, type: 'date' as const, width: '130px' },
    { key: 'notes', label: 'Notes', placeholder: 'Optional', width: '150px' },
  ];

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/finance/budgets');
      setBudgets(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const totalAllocated = budgets.reduce((s, b) => s + parseFloat(b.allocated || 0), 0);
  const totalUtilized = budgets.reduce((s, b) => s + parseFloat(b.utilized || 0), 0);
  const overBudget = budgets.filter(b => parseFloat(b.utilized) > parseFloat(b.allocated));

  return (
    <>
      {showAdd && <AddBudgetDrawer onClose={() => setShowAdd(false)} onSaved={fetchBudgets} />}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Budgets"
          subtitle="Create multiple budget lines at once for different departments or categories"
          columns={BUDGET_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/finance/budgets', { ...row, allocated: parseFloat(row.allocated) })}
          onAllDone={fetchBudgets}
        />
      )}
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Budgets</h1>
            <p className="text-sm text-muted-foreground">Department & category budget tracking with utilization</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchBudgets} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowBulkDrawer(true)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
              <Plus className="w-4 h-4" /> New Budget
            </button>
          </div>
        </div>

        {/* Summary row */}
        {budgets.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Total Allocated</p>
              <p className="text-xl font-bold text-foreground">{fmt(totalAllocated)}</p>
            </div>
            <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Total Utilized</p>
              <p className="text-xl font-bold text-amber-700">{fmt(totalUtilized)}</p>
            </div>
            <div className={`border rounded-2xl p-4 shadow-sm ${overBudget.length > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className="text-xs text-muted-foreground mb-1">Over Budget</p>
              <p className={`text-xl font-bold ${overBudget.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{overBudget.length} budget{overBudget.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}

        {/* Budget Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-white border border-border rounded-2xl">
            <BarChart3 className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">No budgets configured yet</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 text-xs text-primary hover:underline font-medium">Create your first budget →</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {budgets.map(b => <BudgetCard key={b.id} budget={b} />)}
          </div>
        )}
      </div>
    </>
  );
}
