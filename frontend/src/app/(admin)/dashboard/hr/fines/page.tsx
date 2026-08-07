'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertCircle, X, Plus, Search, RefreshCw, CheckCircle, XCircle,
  CreditCard, Clock, Ban, Loader2, ChevronDown, Pencil, Trash2, Settings,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

// ── Status Config ─────────────────────────────────────────────────────────────

const FINE_STATUS_COLORS: Record<string, string> = {
  pending_approval:  'bg-yellow-100 text-yellow-800',
  approved:          'bg-blue-100 text-blue-800',
  rejected:          'bg-red-100 text-red-800',
  payroll_deducted:  'bg-purple-100 text-purple-800',
  manually_paid:     'bg-green-100 text-green-800',
  partially_paid:    'bg-orange-100 text-orange-800',
  waived:            'bg-gray-100 text-gray-600',
  cancelled:         'bg-gray-100 text-gray-500',
};

function FineStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${FINE_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Employee Combobox ─────────────────────────────────────────────────────────

function EmployeeCombobox({
  employees,
  value,
  onChange,
  error,
}: {
  employees: any[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = employees.find(e => e.id === value);
  const filtered = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/30 ${error ? 'border-red-400' : 'border-border'}`}
      >
        {selected ? (
          <span className="text-foreground">
            {selected.first_name} {selected.last_name}
            <span className="text-muted-foreground ml-1.5 text-xs">({selected.employee_code})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select employee…</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-3">No employees found</p>
            ) : (
              filtered.map(e => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { onChange(e.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 text-left transition-colors ${e.id === value ? 'bg-primary/5 text-primary font-medium' : ''}`}
                >
                  <span>{e.first_name} {e.last_name}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2 shrink-0">{e.employee_code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Category Combobox with inline "Add" ──────────────────────────────────────

function CategoryCombobox({
  categories,
  value,
  onChange,
  onCategoryCreated,
  onCategoryDeleted,
  canManageCategories,
  error,
}: {
  categories: any[];
  value: string;
  onChange: (id: string) => void;
  onCategoryCreated: (newCat: any) => void;
  onCategoryDeleted?: (id: string) => void;
  canManageCategories?: boolean;
  error?: string;
}) {
  const { selectedTenantId } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', code: '', category_type: 'disciplinary' });
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAddForm(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = categories.find(c => c.id === value);
  const filtered = categories.filter(c =>
    `${c.name} ${c.category_type}`.toLowerCase().includes(search.toLowerCase())
  );

  const saveNewCategory = async () => {
    if (!newCat.name.trim() || !newCat.code.trim()) { setAddError('Name and code are required'); return; }
    setSaving(true);
    setAddError('');
    try {
      const res = await api.post('/fines/categories', {
        name: newCat.name,
        code: newCat.code.toUpperCase().replace(/\s+/g, '_'),
        category_type: newCat.category_type,
        ...(selectedTenantId ? { tenant_id: selectedTenantId } : {}),
      });
      const created = res.data.data;
      onCategoryCreated(created);
      onChange(created.id);
      setShowAddForm(false);
      setNewCat({ name: '', code: '', category_type: 'disciplinary' });
      setOpen(false);
      setSearch('');
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (e: React.MouseEvent, cat: any) => {
    e.stopPropagation();
    setDeletingId(cat.id);
    try {
      await api.delete(`/fines/categories/${cat.id}`);
      if (value === cat.id) onChange('');
      onCategoryDeleted?.(cat.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setShowAddForm(false); }}
        className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/30 ${error ? 'border-red-400' : 'border-border'}`}>
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? `${selected.name} (${selected.category_type})` : 'Select category…'}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-3">No categories found</p>
            ) : (
              filtered.map(c => (
                <div key={c.id}
                  className={`group flex items-center px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${c.id === value ? 'bg-primary/5' : ''}`}>
                  <button type="button"
                    onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                    className="flex-1 flex items-center justify-between text-left min-w-0">
                    <span className={c.id === value ? 'text-primary font-medium' : ''}>{c.name}</span>
                    <span className="text-xs text-muted-foreground capitalize ml-2 shrink-0">{c.category_type}</span>
                  </button>
                  {canManageCategories && (
                    <button type="button"
                      onClick={e => deleteCategory(e, c)}
                      disabled={deletingId === c.id}
                      title="Delete category"
                      className="ml-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-all shrink-0 disabled:opacity-50">
                      {deletingId === c.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border">
            {!showAddForm ? (
              <button type="button" onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> Add new category
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground">Quick-add category</p>
                {addError && <p className="text-xs text-red-600">{addError}</p>}
                <input value={newCat.name} onChange={e => setNewCat(n => ({ ...n, name: e.target.value }))}
                  placeholder="Category name *" autoFocus
                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <input value={newCat.code}
                  onChange={e => setNewCat(n => ({ ...n, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                  placeholder="Code (e.g. LATE_COMING) *"
                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <select value={newCat.category_type} onChange={e => setNewCat(n => ({ ...n, category_type: e.target.value }))}
                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none">
                  <option value="disciplinary">Disciplinary</option>
                  <option value="financial">Financial</option>
                  <option value="asset">Asset</option>
                  <option value="policy">Policy</option>
                  <option value="recovery">Recovery</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setShowAddForm(false); setAddError(''); }}
                    className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-muted">
                    Cancel
                  </button>
                  <button type="button" onClick={saveNewCategory} disabled={saving}
                    className="flex-1 bg-primary text-white rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create / Edit Fine Drawer ─────────────────────────────────────────────────

function FineFormDrawer({
  employees, categories: initialCategories, onClose, onSaved, onCategoryCreated, onCategoryDeleted,
  editFine,
}: {
  employees: any[];
  categories: any[];
  onClose: () => void;
  onSaved: () => void;
  onCategoryCreated?: (cat: any) => void;
  onCategoryDeleted?: (id: string) => void;
  editFine?: any;
}) {
  const isEdit = !!editFine;
  const { userType } = useAuthStore();
  const canManageCategories = userType === 'org_admin';
  const [localCategories, setLocalCategories] = useState(initialCategories);

  useEffect(() => {
    api.get('/fines/categories')
      .then(r => {
        const fresh = r.data.data ?? [];
        if (fresh.length > 0) setLocalCategories(fresh);
      })
      .catch(() => {});
  }, []);

  const now = new Date();
  const defaultMonth = String(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2);
  const defaultYear  = String(now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear());

  const [form, setForm] = useState({
    employee_id:             editFine?.employee_id             ?? '',
    category_id:             editFine?.category_id             ?? '',
    title:                   editFine?.title                   ?? '',
    description:             editFine?.description             ?? '',
    fine_amount:             editFine?.fine_amount             ? String(editFine.fine_amount) : '',
    deduction_mode:          editFine?.deduction_mode          ?? 'payroll',
    payroll_month:           editFine?.payroll_month           ? String(editFine.payroll_month) : defaultMonth,
    payroll_year:            editFine?.payroll_year            ? String(editFine.payroll_year)  : defaultYear,
    installment_start_month: editFine?.installment_start_month ? String(editFine.installment_start_month) : defaultMonth,
    installment_start_year:  editFine?.installment_start_year  ? String(editFine.installment_start_year)  : defaultYear,
    installment_percentage:  editFine?.installment_percentage  ? String(editFine.installment_percentage)  : '',
    priority:                editFine?.priority                ?? 'normal',
    created_at:              editFine?.created_at              ? new Date(editFine.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isEdit && !form.employee_id) e.employee_id = 'Select an employee';
    if (!form.category_id) e.category_id = 'Select a category';
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.fine_amount || parseFloat(form.fine_amount) <= 0) e.fine_amount = 'Amount must be greater than 0';
    if (!form.created_at) e.created_at = 'Fine date is required';
    if (form.deduction_mode === 'payroll') {
      if (!form.payroll_month) e.payroll_month = 'Select payroll month';
      if (!form.payroll_year) e.payroll_year = 'Enter payroll year';
    }
    if (form.deduction_mode === 'installment') {
      if (parseFloat(form.fine_amount) <= 3000) e.deduction_mode = 'Installment mode requires fine amount greater than ₹3,000';
      if (!form.installment_start_month) e.installment_start_month = 'Select start month';
      if (!form.installment_start_year) e.installment_start_year = 'Enter start year';
      if (!form.installment_percentage || parseFloat(form.installment_percentage) <= 0)
        e.installment_percentage = 'Enter deduction percentage';
      else if (parseFloat(form.installment_percentage) > 100)
        e.installment_percentage = 'Percentage cannot exceed 100%';
    }
    if (isEdit) {
      if (!changeReason) e.change_reason = 'Please select a change reason';
      if (changeReason === 'Other' && !customReason.trim()) e.custom_reason = 'Please specify the change reason';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        fine_amount: parseFloat(form.fine_amount),
        payroll_month: form.deduction_mode === 'payroll' ? parseInt(form.payroll_month) : undefined,
        payroll_year: form.deduction_mode === 'payroll' ? parseInt(form.payroll_year) : undefined,
        installment_start_month: form.deduction_mode === 'installment' ? parseInt(form.installment_start_month) : undefined,
        installment_start_year: form.deduction_mode === 'installment' ? parseInt(form.installment_start_year) : undefined,
        installment_percentage: form.deduction_mode === 'installment' ? parseFloat(form.installment_percentage) : undefined,
        change_reason: isEdit ? (changeReason === 'Other' ? customReason : changeReason) : undefined,
      };
      if (isEdit) {
        await api.put(`/fines/${editFine.id}`, payload);
      } else {
        await api.post('/fines', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.message || (isEdit ? 'Failed to update fine' : 'Failed to create fine') });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!validate()) return;
    if (isEdit) {
      setShowConfirmModal(true);
    } else {
      save();
    }
  };

  const field = (key: string, label: string, type = 'text', required = false) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={(form as any)[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors[key] ? 'border-red-400' : 'border-border'}`} />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">{isEdit ? 'Edit Fine' : 'Raise Fine / Deduction'}</h2>
            <p className="text-xs text-muted-foreground">
              {isEdit ? 'Editing a pending-approval fine' : 'Will be submitted for approval before taking effect'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}

          {/* Employee — read-only when editing */}
          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Employee <span className="text-red-500">*</span></label>
              <EmployeeCombobox
                employees={employees}
                value={form.employee_id}
                onChange={id => setForm(f => ({ ...f, employee_id: id }))}
                error={errors.employee_id}
              />
              {errors.employee_id && <p className="text-xs text-red-500 mt-1">{errors.employee_id}</p>}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Deduction Category <span className="text-red-500">*</span></label>
            <CategoryCombobox
              categories={localCategories}
              value={form.category_id}
              onChange={id => setForm(f => ({ ...f, category_id: id }))}
              onCategoryCreated={cat => {
                setLocalCategories(prev => [...prev, cat]);
                onCategoryCreated?.(cat);
              }}
              onCategoryDeleted={id => {
                setLocalCategories(prev => prev.filter(c => c.id !== id));
                onCategoryDeleted?.(id);
              }}
              canManageCategories={canManageCategories}
              error={errors.category_id}
            />
            {errors.category_id && <p className="text-xs text-red-500 mt-1">{errors.category_id}</p>}
          </div>

          {field('title', 'Fine Title', 'text', true)}

          {/* Fine Date */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input type="date" value={form.created_at}
              onChange={e => setForm(f => ({ ...f, created_at: e.target.value }))}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.created_at ? 'border-red-400' : 'border-border'}`} />
            {errors.created_at && <p className="text-xs text-red-500 mt-1">{errors.created_at}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Fine Amount (₹) <span className="text-red-500">*</span></label>
            <input type="number" min="1" step="0.01" value={form.fine_amount}
              onChange={e => {
                const val = e.target.value;
                setForm(f => ({
                  ...f,
                  fine_amount: val,
                  deduction_mode: f.deduction_mode === 'installment' && (!val || parseFloat(val) <= 3000) ? 'payroll' : f.deduction_mode,
                }));
              }} placeholder="0.00"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.fine_amount ? 'border-red-400' : 'border-border'}`} />
            {errors.fine_amount && <p className="text-xs text-red-500 mt-1">{errors.fine_amount}</p>}
          </div>

          {/* Deduction Mode */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Deduction Mode <span className="text-red-500">*</span></label>
            <select
              value={form.deduction_mode}
              onChange={e => {
                const mode = e.target.value;
                setForm(f => ({ ...f, deduction_mode: mode }));
              }}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.deduction_mode ? 'border-red-400' : 'border-border'}`}
            >
              <option value="payroll">Payroll Deduction (auto-deduct from salary)</option>
              <option value="manual">Manual Settlement (employee pays directly)</option>
              <option value="installment" disabled={!form.fine_amount || parseFloat(form.fine_amount) <= 3000}>
                Installment (multiple payroll cycles){!form.fine_amount || parseFloat(form.fine_amount) <= 3000 ? ' — requires amount > ₹3,000' : ''}
              </option>
            </select>
            {errors.deduction_mode && <p className="text-xs text-red-500 mt-1">{errors.deduction_mode}</p>}
            {(!form.fine_amount || parseFloat(form.fine_amount) <= 3000) && (
              <p className="text-xs text-muted-foreground mt-1">Installment mode is only available for fines greater than ₹3,000.</p>
            )}
          </div>

          {/* Payroll Cycle — shown for payroll mode */}
          {form.deduction_mode === 'payroll' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Payroll Month <span className="text-red-500">*</span></label>
                <select value={form.payroll_month} onChange={e => setForm(f => ({ ...f, payroll_month: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.payroll_month ? 'border-red-400' : 'border-border'}`}>
                  {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                {errors.payroll_month && <p className="text-xs text-red-500 mt-1">{errors.payroll_month}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Payroll Year <span className="text-red-500">*</span></label>
                <input type="number" min="2020" max="2099" value={form.payroll_year}
                  onChange={e => setForm(f => ({ ...f, payroll_year: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.payroll_year ? 'border-red-400' : 'border-border'}`} />
                {errors.payroll_year && <p className="text-xs text-red-500 mt-1">{errors.payroll_year}</p>}
              </div>
            </div>
          )}

          {/* Installment Settings — shown when installment mode is selected */}
          {form.deduction_mode === 'installment' && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary">Installment Configuration</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Start Month <span className="text-red-500">*</span></label>
                  <select value={form.installment_start_month} onChange={e => setForm(f => ({ ...f, installment_start_month: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.installment_start_month ? 'border-red-400' : 'border-border'}`}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  {errors.installment_start_month && <p className="text-xs text-red-500 mt-1">{errors.installment_start_month}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Start Year <span className="text-red-500">*</span></label>
                  <input type="number" min="2020" max="2099" value={form.installment_start_year}
                    onChange={e => setForm(f => ({ ...f, installment_start_year: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.installment_start_year ? 'border-red-400' : 'border-border'}`} />
                  {errors.installment_start_year && <p className="text-xs text-red-500 mt-1">{errors.installment_start_year}</p>}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Deduction Percentage per Cycle (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" min="1" max="100" step="0.01" placeholder="e.g. 25"
                  value={form.installment_percentage}
                  onChange={e => setForm(f => ({ ...f, installment_percentage: e.target.value }))}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.installment_percentage ? 'border-red-400' : 'border-border'}`}
                />
                {errors.installment_percentage && <p className="text-xs text-red-500 mt-1">{errors.installment_percentage}</p>}
                {form.installment_percentage && form.fine_amount && parseFloat(form.installment_percentage) > 0 && parseFloat(form.fine_amount) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    ₹{((parseFloat(form.fine_amount) * parseFloat(form.installment_percentage)) / 100).toFixed(2)} deducted per payroll cycle
                    · approx. {Math.ceil(100 / parseFloat(form.installment_percentage))} cycle(s) to clear
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reason / Description</label>
            <textarea value={form.description} rows={3}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the reason for this deduction…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Change Reason justification (mandatory when editing) */}
          {isEdit && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold text-primary">Mandatory Edit Justification</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Change Reason *</label>
                <select value={changeReason} onChange={e => setChangeReason(e.target.value)}
                  className={`w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white ${errors.change_reason ? 'border-red-400' : ''}`}>
                  <option value="">Select reason…</option>
                  <option value="Incorrect amount entered">Incorrect amount entered</option>
                  <option value="Administrative correction">Administrative correction</option>
                  <option value="HR adjustment">HR adjustment</option>
                  <option value="Supporting document received">Supporting document received</option>
                  <option value="Calculation correction">Calculation correction</option>
                  <option value="Other">Other</option>
                </select>
                {errors.change_reason && <p className="text-xs text-red-500 mt-1">{errors.change_reason}</p>}
              </div>
              {changeReason === 'Other' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Specify Reason *</label>
                  <textarea value={customReason} onChange={e => setCustomReason(e.target.value)} rows={2}
                    placeholder="Enter detailed reason for modification…"
                    className={`w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none bg-white ${errors.custom_reason ? 'border-red-400' : ''}`} />
                  {errors.custom_reason && <p className="text-xs text-red-500 mt-1">{errors.custom_reason}</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSaveClick} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isEdit ? <Pencil className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {isEdit ? 'Save Changes' : 'Submit for Approval'}
          </Button>
        </div>
      </div>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <h3 className="font-bold text-sm text-center">Modify Fine / Deduction Record</h3>
              <p className="text-xs text-muted-foreground text-center">
                You are about to modify a payroll-affecting record. These changes may affect salary calculations, payslips, and payroll reports.
              </p>
              <p className="text-xs font-semibold text-center text-foreground">Do you want to continue?</p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => { setShowConfirmModal(false); save(); }} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settlement Modal ──────────────────────────────────────────────────────────

function SettlementModal({ fine, onClose, onSaved }: { fine: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    amount: String(fine.fine_amount - (fine.amount_deducted || 0) - (fine.amount_paid_manually || 0) - (fine.amount_waived || 0)),
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    payment_reference: '', payment_proof_url: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    setSaving(true);
    try {
      await api.post(`/fines/${fine.id}/settle`, { ...form, amount: parseFloat(form.amount) });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit settlement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-sm">Submit Manual Payment</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <p className="text-xs text-muted-foreground">Fine: <span className="font-medium text-foreground">{fine.title}</span> — Outstanding: ₹{(fine.fine_amount - (fine.amount_deducted || 0) - (fine.amount_paid_manually || 0) - (fine.amount_waived || 0)).toFixed(2)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Amount (₹) <span className="text-red-500">*</span></label>
              <input type="number" min="1" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Date</label>
              <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Payment Method</label>
            <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Transaction Reference / UTR</label>
            <input type="text" value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))}
              placeholder="e.g. UTR123456789" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Proof URL (screenshot / receipt)</label>
            <input type="text" value={form.payment_proof_url} onChange={e => setForm(f => ({ ...f, payment_proof_url: e.target.value }))}
              placeholder="https://…" className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea value={form.notes} rows={2} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
            Submit Payment
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Fine Detail Drawer ────────────────────────────────────────────────────────

function FineDetailDrawer({ fine, onClose, onAction }: { fine: any; onClose: () => void; onAction: () => void }) {
  const [waiving, setWaiving] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');
  const [showSettle, setShowSettle] = useState(false);
  const [showWaive, setShowWaive] = useState(false);
  const [loading, setLoading] = useState(false);

  const amountRemaining = parseFloat(fine.fine_amount) - parseFloat(fine.amount_deducted || 0)
    - parseFloat(fine.amount_paid_manually || 0) - parseFloat(fine.amount_waived || 0);

  const waive = async () => {
    if (!waiveReason.trim() || waiveReason.length < 5) return;
    setWaiving(true);
    try {
      await api.post(`/fines/${fine.id}/waive`, { reason: waiveReason });
      onAction();
      onClose();
    } catch {
      setWaiving(false);
    }
  };

  const verifyPayment = async (paymentId: string, status: 'verified' | 'rejected') => {
    setLoading(true);
    try {
      await api.post(`/fines/${fine.id}/payments/${paymentId}/verify`, { status });
      onAction();
    } finally {
      setLoading(false);
    }
  };

  const approvalLog: any[] = Array.isArray(fine.approval_log) ? fine.approval_log : [];

  return (
    <>
      {showSettle && <SettlementModal fine={fine} onClose={() => setShowSettle(false)} onSaved={() => { onAction(); setShowSettle(false); }} />}
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div>
              <h2 className="text-base font-bold">{fine.title}</h2>
              <p className="text-xs text-muted-foreground">{fine.first_name} {fine.last_name} · {fine.category_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <FineStatusBadge status={fine.status} />
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Amount Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Fine Amount', value: `₹${parseFloat(fine.fine_amount).toFixed(2)}` },
                { label: 'Outstanding', value: `₹${amountRemaining.toFixed(2)}`, highlight: amountRemaining > 0 },
                { label: 'Mode', value: fine.deduction_mode?.replace(/_/g, ' ') },
              ].map(({ label, value, highlight }) => (
                <div key={label} className={`rounded-xl p-3 ${highlight ? 'bg-red-50 border border-red-200' : 'bg-muted/40'}`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-semibold text-sm mt-0.5 ${highlight ? 'text-red-700' : ''}`}>{value}</p>
                </div>
              ))}
            </div>

            {fine.description && (
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{fine.description}</p>
              </div>
            )}

            {fine.deduction_mode === 'payroll' && fine.payroll_month && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                Target payroll: {MONTHS[fine.payroll_month - 1]} {fine.payroll_year}
              </div>
            )}

            {fine.last_modified_at && (fine.deduction_mode === 'payroll' || fine.deduction_mode === 'installment') && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 flex justify-between items-center">
                <div>
                  <p className="text-xs text-primary font-bold uppercase tracking-wider">Payroll Impact</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Affected Payroll Period: <span className="font-semibold text-foreground">{MONTHS[fine.payroll_month - 1]} {fine.payroll_year}</span></p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200">
                  YES
                </span>
              </div>
            )}

            {/* Approval Timeline */}
            {approvalLog.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Approval Timeline</p>
                <div className="space-y-3">
                  {approvalLog.map((entry: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        entry.action === 'approved' || entry.action === 'payroll_deducted' ? 'bg-green-100' :
                        entry.action === 'rejected' ? 'bg-red-100' :
                        entry.action === 'waived' ? 'bg-gray-100' : 'bg-blue-100'
                      }`}>
                        {entry.action === 'approved' || entry.action === 'payroll_deducted' ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> :
                         entry.action === 'rejected' ? <XCircle className="w-3.5 h-3.5 text-red-600" /> :
                         <Clock className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium capitalize">{entry.action.replace(/_/g, ' ')}</p>
                        {entry.reason && <p className="text-xs text-muted-foreground">{entry.reason}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modification History */}
            {fine.history?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Modification History</p>
                <div className="space-y-4">
                  {fine.history.map((h: any) => (
                    <div key={h.id} className="bg-muted/20 border border-border/60 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium text-[10px]">
                          {h.editor_user_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs">
                        <span className="text-muted-foreground">Edited By:</span> <span className="font-medium">{h.editor_name}</span>
                      </p>
                      <div className="grid grid-cols-3 gap-2 bg-white/60 p-2.5 rounded-lg border border-border/30 text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Field</p>
                          <p className="font-semibold text-gray-800">{h.field_changed}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Old</p>
                          <p className="font-medium text-red-600 line-through">{h.old_value || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">New</p>
                          <p className="font-semibold text-green-700">{h.new_value || '—'}</p>
                        </div>
                      </div>
                      <p className="text-xs">
                        <span className="text-muted-foreground font-medium">Reason:</span> <span className="text-foreground font-semibold">{h.change_reason}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment History */}
            {fine.payments?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment History</p>
                <div className="space-y-2">
                  {fine.payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
                      <div>
                        <p className="text-xs font-medium">₹{parseFloat(p.amount).toFixed(2)} — {p.payment_type.replace(/_/g, ' ')}</p>
                        {p.payment_method && <p className="text-xs text-muted-foreground">{p.payment_method} {p.payment_reference && `· ${p.payment_reference}`}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'verified' ? 'bg-green-100 text-green-700' : p.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {p.status}
                        </span>
                        {p.status === 'pending' && p.payment_type === 'manual_payment' && (
                          <div className="flex gap-1">
                            <button onClick={() => verifyPayment(p.id, 'verified')} disabled={loading}
                              className="w-6 h-6 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center" title="Verify">
                              <CheckCircle className="w-3.5 h-3.5 text-green-700" />
                            </button>
                            <button onClick={() => verifyPayment(p.id, 'rejected')} disabled={loading}
                              className="w-6 h-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center" title="Reject">
                              <XCircle className="w-3.5 h-3.5 text-red-700" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waive Form */}
            {showWaive && ['approved', 'partially_paid'].includes(fine.status) && (
              <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-orange-800">Waive this fine</p>
                <textarea value={waiveReason} onChange={e => setWaiveReason(e.target.value)}
                  placeholder="Reason for waiving (minimum 5 characters)…" rows={2}
                  className="w-full border border-orange-300 rounded-xl px-3 py-2 text-sm resize-none bg-white" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowWaive(false)}>Cancel</Button>
                  <Button size="sm" variant="destructive" onClick={waive} disabled={waiving || waiveReason.length < 5}>
                    {waiving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                    Confirm Waiver
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          {['approved', 'partially_paid'].includes(fine.status) && (
            <div className="px-6 py-4 border-t shrink-0 flex gap-3">
              {fine.deduction_mode !== 'payroll' && (
                <Button variant="outline" className="flex-1" onClick={() => setShowSettle(true)}>
                  <CreditCard className="w-4 h-4 mr-2" /> Record Payment
                </Button>
              )}
              {!showWaive && (
                <Button variant="outline" className="flex-1 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setShowWaive(true)}>
                  <Ban className="w-4 h-4 mr-2" /> Waive Fine
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Edit Category Modal ───────────────────────────────────────────────────────

function EditCategoryModal({ category, onClose, onSaved }: { category: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: category.name ?? '',
    description: category.description ?? '',
    category_type: category.category_type ?? 'disciplinary',
    is_payroll_deductible: category.is_payroll_deductible ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/fines/categories/${category.id}`, form);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-sm">Edit Category</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
            <select value={form.category_type} onChange={e => setForm(f => ({ ...f, category_type: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none">
              <option value="disciplinary">Disciplinary</option>
              <option value="financial">Financial</option>
              <option value="asset">Asset</option>
              <option value="policy">Policy</option>
              <option value="recovery">Recovery</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea value={form.description} rows={2} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_payroll_deductible} onChange={e => setForm(f => ({ ...f, is_payroll_deductible: e.target.checked }))}
              className="w-4 h-4 rounded" />
            <span className="text-sm">Payroll deductible</span>
          </label>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  title, description, onClose, onConfirm,
}: { title: string; description: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Action failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="p-6 space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="font-bold text-sm text-center">{title}</h3>
          <p className="text-xs text-muted-foreground text-center">{description}</p>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={confirm} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics Panel ───────────────────────────────────────────────────────────

function AnalyticsPanel() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/fines/analytics')
      .then(r => setAnalytics(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!analytics) return null;

  const s = analytics.summary;
  const summaryCards = [
    { label: 'Total Fines', value: s?.total_fines ?? 0 },
    { label: 'Total Amount', value: `₹${parseFloat(s?.total_amount ?? 0).toFixed(0)}` },
    { label: 'Outstanding', value: `₹${parseFloat(s?.total_outstanding ?? 0).toFixed(0)}`, highlight: true },
    { label: 'Payroll Deducted', value: `₹${parseFloat(s?.total_payroll_deducted ?? 0).toFixed(0)}` },
    { label: 'Manually Paid', value: `₹${parseFloat(s?.total_manually_paid ?? 0).toFixed(0)}` },
    { label: 'Waived', value: `₹${parseFloat(s?.total_waived ?? 0).toFixed(0)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map(c => (
          <Card key={c.label} className={c.highlight ? 'border-red-200' : ''}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold mt-1 ${c.highlight ? 'text-red-600' : ''}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">By Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.by_status?.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between">
                  <FineStatusBadge status={s.status} />
                  <div className="text-right">
                    <span className="text-xs font-semibold">{s.count}</span>
                    <span className="text-xs text-muted-foreground ml-2">₹{parseFloat(s.amount).toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.by_category?.slice(0, 8).map((c: any) => (
                <div key={c.category_name} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{c.category_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.category_type}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold">{c.count}</span>
                    <span className="text-xs text-muted-foreground ml-2">₹{parseFloat(c.amount).toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {analytics.by_branch?.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">By Branch</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics.by_branch?.map((b: any) => (
                  <div key={b.branch_id ?? 'unknown'} className="flex items-center justify-between">
                    <p className="text-xs font-medium">{b.branch_name ?? 'No Branch'}</p>
                    <div className="text-right">
                      <span className="text-xs font-semibold">{b.count}</span>
                      <span className="text-xs text-muted-foreground ml-2">₹{parseFloat(b.amount).toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {analytics.overdue_count > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700">{analytics.overdue_count} Overdue Payroll Fines</p>
                <p className="text-xs text-red-600">Approved fines past their target payroll cycle have not been deducted yet.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Categories Management Panel ───────────────────────────────────────────────

const CATEGORY_TYPE_COLORS: Record<string, string> = {
  disciplinary: 'bg-red-100 text-red-700',
  financial:    'bg-blue-100 text-blue-700',
  asset:        'bg-yellow-100 text-yellow-700',
  policy:       'bg-purple-100 text-purple-700',
  recovery:     'bg-green-100 text-green-700',
};

function CategoriesPanel({ canManageCategories }: { canManageCategories: boolean }) {
  const { selectedTenantId } = useAuthStore();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [deleteCat, setDeleteCat] = useState<any>(null);
  const [search, setSearch] = useState('');

  const [newCat, setNewCat] = useState({ name: '', code: '', category_type: 'disciplinary', description: '' });
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchCategories = useCallback(() => {
    setLoading(true);
    api.get('/fines/categories', { params: { include_inactive: true } })
      .then(r => setCategories(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const filtered = categories.filter(c =>
    `${c.name} ${c.code} ${c.category_type}`.toLowerCase().includes(search.toLowerCase())
  );

  const saveCreate = async () => {
    if (!newCat.name.trim() || !newCat.code.trim()) { setCreateError('Name and code are required'); return; }
    setSaving(true);
    setCreateError('');
    try {
      await api.post('/fines/categories', {
        ...newCat,
        code: newCat.code.toUpperCase().replace(/\s+/g, '_'),
        ...(selectedTenantId ? { tenant_id: selectedTenantId } : {}),
      });
      fetchCategories();
      setShowCreate(false);
      setNewCat({ name: '', code: '', category_type: 'disciplinary', description: '' });
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await api.delete(`/fines/categories/${deleteCat.id}`);
    fetchCategories();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search categories…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {canManageCategories && (
          <Button size="sm" onClick={() => setShowCreate(s => !s)}>
            <Plus className="w-4 h-4 mr-2" /> New Category
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && canManageCategories && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Deduction Category</p>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Name <span className="text-red-500">*</span></label>
                <input value={newCat.name} onChange={e => setNewCat(n => ({ ...n, name: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Code <span className="text-red-500">*</span></label>
                <input value={newCat.code} onChange={e => setNewCat(n => ({ ...n, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                  placeholder="e.g. LATE_COMING" className="w-full border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
                <select value={newCat.category_type} onChange={e => setNewCat(n => ({ ...n, category_type: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none">
                  <option value="disciplinary">Disciplinary</option>
                  <option value="financial">Financial</option>
                  <option value="asset">Asset</option>
                  <option value="policy">Policy</option>
                  <option value="recovery">Recovery</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <input value={newCat.description} onChange={e => setNewCat(n => ({ ...n, description: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setCreateError(''); }}>Cancel</Button>
              <Button size="sm" onClick={saveCreate} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Settings className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No categories found</p>
            </div>
          ) : (
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  {['Name', 'Code', 'Type', 'Payroll Deductible', 'Status', ...(canManageCategories ? [''] : [])].map(h => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {filtered.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <p className="font-medium">{cat.name}</p>
                      {cat.description && <p className="text-xs text-muted-foreground truncate max-w-48">{cat.description}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{cat.code}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${CATEGORY_TYPE_COLORS[cat.category_type] ?? 'bg-gray-100 text-gray-700'}`}>
                        {cat.category_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      {cat.is_payroll_deductible ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    {canManageCategories && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditCat(cat)} title="Edit"
                            className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {cat.is_active && (
                            <button onClick={() => setDeleteCat(cat)} title="Deactivate"
                              className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editCat && (
        <EditCategoryModal category={editCat} onClose={() => setEditCat(null)} onSaved={() => { fetchCategories(); setEditCat(null); }} />
      )}
      {deleteCat && (
        <DeleteConfirmModal
          title="Deactivate Category"
          description={`"${deleteCat.name}" will be deactivated and no longer available for new fines.`}
          onClose={() => setDeleteCat(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// ── Reports Panel ────────────────────────────────────────────────────────────

function ReportsPanel() {
  const [selectedReport, setSelectedReport] = useState('edited-fines');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/fines/reports/${selectedReport}`);
      setReportData(res.data.data || []);
    } catch {
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedReport]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const reportsList = [
    { key: 'edited-fines', label: 'Edited Fine Records', desc: 'Fines that have been edited by administrators.' },
    { key: 'edited-deductions', label: 'Edited Deduction Records', desc: 'Deductions that have been edited by administrators.' },
    { key: 'most-modified', label: 'Most Modified Records', desc: 'Fine/deduction records with the most modifications.' },
    { key: 'payroll-adjustments', label: 'Payroll Adjustment History', desc: 'Detailed audit log of all fine/deduction modifications.' },
    { key: 'admin-activity', label: 'Admin Modification Activity', desc: 'Modification activity summaries grouped by administrator.' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Select Report Type</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reportsList.find(r => r.key === selectedReport)?.desc}
              </p>
            </div>
            <select value={selectedReport} onChange={e => setSelectedReport(e.target.value)}
              className="border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-64 bg-white">
              {reportsList.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : reportData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No report records found</p>
              <p className="text-xs mt-1">There is no modification history for this report yet.</p>
            </div>
          ) : (
            <Table className="w-full text-sm">
              <TableHeader>
                {selectedReport === 'edited-fines' || selectedReport === 'edited-deductions' ? (
                  <TableRow>
                    {['Employee', 'Title', 'Category', 'Amount', 'Modified By', 'Modified Date', 'Last Reason'].map(h => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                ) : selectedReport === 'most-modified' ? (
                  <TableRow>
                    {['Employee', 'Record Title', 'Amount', 'Status', 'Modification Count'].map(h => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                ) : selectedReport === 'payroll-adjustments' ? (
                  <TableRow>
                    {['Date & Time', 'Record Title', 'Employee', 'Field Changed', 'Old Value', 'New Value', 'Edited By', 'Role', 'Change Reason'].map(h => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                ) : (
                  <TableRow>
                    {['Administrator Name', 'User Type/Role', 'Total Modifications', 'Last Active Time'].map(h => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                )}
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {selectedReport === 'edited-fines' || selectedReport === 'edited-deductions' ? (
                  reportData.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.first_name} {row.last_name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee_code}</p>
                      </TableCell>
                      <TableCell className="font-medium">{row.title}</TableCell>
                      <TableCell className="text-xs">{row.category_name}</TableCell>
                      <TableCell className="font-semibold">₹{parseFloat(row.fine_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{row.modifier_name || row.modified_by_email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(row.last_modified_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs font-medium text-primary">{row.change_reason}</TableCell>
                    </TableRow>
                  ))
                ) : selectedReport === 'most-modified' ? (
                  reportData.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.first_name} {row.last_name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee_code}</p>
                      </TableCell>
                      <TableCell className="font-medium">{row.title}</TableCell>
                      <TableCell className="font-semibold">₹{parseFloat(row.fine_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs"><FineStatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-sm font-bold text-red-600">{row.modification_count}</TableCell>
                    </TableRow>
                  ))
                ) : selectedReport === 'payroll-adjustments' ? (
                  reportData.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-semibold">{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs font-medium">{row.record_title} <span className="block text-[10px] text-muted-foreground">({row.record_status})</span></TableCell>
                      <TableCell className="text-xs font-medium">{row.employee_name}</TableCell>
                      <TableCell className="text-xs font-bold text-gray-700">{row.field_changed}</TableCell>
                      <TableCell className="text-xs text-red-600 line-through">{row.old_value || '—'}</TableCell>
                      <TableCell className="text-xs text-green-700 font-semibold">{row.new_value || '—'}</TableCell>
                      <TableCell className="text-xs font-medium">{row.editor_name}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{row.editor_user_type?.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs text-primary font-medium">{row.change_reason}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  reportData.map((row: any) => (
                    <TableRow key={row.edited_by}>
                      <TableCell className="font-medium">{row.admin_name}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{row.editor_user_type?.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-sm font-bold text-primary">{row.total_modifications}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(row.last_activity).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = ['All Fines', 'Pending Approval', 'Payroll-Linked', 'Manual Settlement', 'Reports', 'Analytics', 'Categories'] as const;

export default function FinesPage() {
  const { userType } = useAuthStore();
  const isOrgAdmin = userType === 'org_admin';
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('All Fines');
  const [fines, setFines] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFine, setSelectedFine] = useState<any>(null);
  const [editFine, setEditFine] = useState<any>(null);
  const [deleteFine, setDeleteFine] = useState<any>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const tabToStatus: Record<string, string> = {
    'Pending Approval': 'pending_approval',
    'Payroll-Linked':   '',
    'Manual Settlement': '',
  };

  const fetchFines = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: 20 };
      if (filterStatus) params.status = filterStatus;
      else if (tabToStatus[activeTab]) params.status = tabToStatus[activeTab];
      if (activeTab === 'Payroll-Linked') params.deduction_mode = 'payroll';
      if (activeTab === 'Manual Settlement') params.deduction_mode = 'manual';

      const res = await api.get('/fines', { params });
      let data = res.data.data?.data ?? res.data.data ?? [];
      if (search.trim()) {
        const q = search.toLowerCase();
        data = data.filter((f: any) =>
          `${f.first_name} ${f.last_name} ${f.employee_code} ${f.title}`.toLowerCase().includes(q));
      }
      setFines(data);
      setTotal(res.data.data?.total ?? data.length);
    } catch {
      setFines([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterStatus, page, search]);

  useEffect(() => { fetchFines(); }, [fetchFines]);

  useEffect(() => {
    api.get('/employees', { params: { limit: 500, status: 'active' } })
      .then(r => setEmployees(r.data.data?.data ?? r.data.data ?? [])).catch(() => {});
    api.get('/fines/categories')
      .then(r => setCategories(r.data.data ?? [])).catch(() => {});
  }, []);

  const openDetail = async (fine: any) => {
    try {
      const res = await api.get(`/fines/${fine.id}`);
      setSelectedFine(res.data.data);
    } catch {
      setSelectedFine(fine);
    }
  };

  const handleCancelFine = async () => {
    await api.delete(`/fines/${deleteFine.id}`);
    fetchFines();
  };

  const isListTab = !['Reports', 'Analytics', 'Categories'].includes(activeTab);

  const allowedTabs = TABS.filter(t => {
    if (t === 'Reports') return isOrgAdmin;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Fines & Deductions</h1>
            <p className="text-xs text-muted-foreground">Manage employee disciplinary and operational deductions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isListTab && (
            <Button variant="outline" size="sm" onClick={fetchFines}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Raise Fine
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {allowedTabs.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Analytics' ? (
        <AnalyticsPanel />
      ) : activeTab === 'Categories' ? (
        <CategoriesPanel canManageCategories={isOrgAdmin} />
      ) : activeTab === 'Reports' ? (
        <ReportsPanel />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or fine title…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">All Statuses</option>
              {Object.keys(FINE_STATUS_COLORS).map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : fines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm font-medium">No fines found</p>
                  <p className="text-xs mt-1">Use "Raise Fine" to create a new deduction</p>
                </div>
              ) : (
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      {['Employee', 'Fine Title', 'Category', 'Amount', 'Mode', 'Target Payroll', 'Status', 'Created By', 'Last Modified By', 'Last Modified Date', ''].map(h => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {fines.map(fine => (
                      <TableRow key={fine.id}>
                        <TableCell>
                          <p className="font-medium">{fine.first_name} {fine.last_name}</p>
                          <p className="text-xs text-muted-foreground">{fine.employee_code}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium max-w-48 truncate">{fine.title}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs">{fine.category_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{fine.category_type}</p>
                        </TableCell>
                        <TableCell className="font-semibold">₹{parseFloat(fine.fine_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="text-xs capitalize">{fine.deduction_mode?.replace(/_/g, ' ')}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fine.payroll_month ? `${MONTHS[fine.payroll_month - 1]} ${fine.payroll_year}` : '—'}
                        </TableCell>
                        <TableCell><FineStatusBadge status={fine.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fine.creator_name || 'System'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fine.modifier_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fine.last_modified_at ? new Date(fine.last_modified_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openDetail(fine)}
                              className="text-xs text-primary hover:underline font-medium px-1">
                              View
                            </button>
                            {isOrgAdmin && ['pending_approval', 'approved', 'partially_paid'].includes(fine.status) && (
                              <button onClick={() => setEditFine(fine)} title="Edit"
                                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isOrgAdmin && ['pending_approval', 'approved', 'partially_paid'].includes(fine.status) && (
                              <button onClick={() => setDeleteFine(fine)} title="Cancel fine"
                                className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
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

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <span className="text-sm text-muted-foreground px-2 py-1">Page {page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={fines.length < 20}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* Drawers & Modals */}
      {showCreate && (
        <FineFormDrawer employees={employees} categories={categories}
          onClose={() => setShowCreate(false)} onSaved={fetchFines}
          onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
          onCategoryDeleted={id => setCategories(prev => prev.filter(c => c.id !== id))} />
      )}
      {editFine && (
        <FineFormDrawer employees={employees} categories={categories}
          onClose={() => setEditFine(null)} onSaved={() => { fetchFines(); setEditFine(null); }}
          onCategoryCreated={cat => setCategories(prev => [...prev, cat])}
          onCategoryDeleted={id => setCategories(prev => prev.filter(c => c.id !== id))}
          editFine={editFine} />
      )}
      {selectedFine && (
        <FineDetailDrawer fine={selectedFine} onClose={() => setSelectedFine(null)}
          onAction={() => { fetchFines(); setSelectedFine(null); }} />
      )}
      {deleteFine && (
        <DeleteConfirmModal
          title="Cancel Fine"
          description={`Cancel "${deleteFine.title}" for ${deleteFine.first_name} ${deleteFine.last_name}? This action cannot be undone.`}
          onClose={() => setDeleteFine(null)}
          onConfirm={handleCancelFine}
        />
      )}
    </div>
  );
}
