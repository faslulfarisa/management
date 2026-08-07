'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import {
  Loader2, X, Pencil, Trash2, Building2, Users, UserMinus,
  Search, AlertTriangle, Sparkles, ChevronUp, ChevronDown, GitBranch, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeleteWarningModal } from '@/components/ui/delete-warning-modal';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import ManagerSelectCombobox from '@/components/ManagerSelectCombobox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type ScopeType = 'ORGANIZATION' | 'SELECTED_BRANCHES' | 'SINGLE_BRANCH';

interface Department {
  id: string;
  code: string;
  name: string;
  scope_type: ScopeType;
  is_global_department: boolean;
  branch_id: string | null;
  branch_name: string | null;
  branch_ids: string[];
  parent_id: string | null;
  parent_name: string | null;
  property_name: string | null;
  head_employee_id: string | null;
  head_employee_name: string | null;
  employee_count: number;
  resigned_count: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

type SortKey = 'code' | 'name' | 'scope_type' | 'parent_name' | 'head_employee_name' | 'employee_count' | 'resigned_count';

const SCOPE_OPTIONS: { value: ScopeType; label: string; icon: typeof Globe }[] = [
  { value: 'ORGANIZATION', label: 'Organization Wide', icon: Globe },
  { value: 'SELECTED_BRANCHES', label: 'Selected Branches', icon: GitBranch },
  { value: 'SINGLE_BRANCH', label: 'Single Branch', icon: Building2 },
];

/* ── Drawer ───────────────────────────────────────────────────────────────── */
function DeptDrawer({
  dept,
  departments,
  branches,
  onClose,
  onSaved,
}: {
  dept: Department | null;
  departments: Department[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: dept?.name || '',
    code: dept?.code || '',
    scope_type: dept?.scope_type || 'SINGLE_BRANCH' as ScopeType,
    branch_id: dept?.branch_id || '',
    branch_ids: dept?.branch_ids || [] as string[],
    parent_id: dept?.parent_id || '',
    head_employee_id: dept?.head_employee_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  const nameConflict = useMemo(() => {
    if (!form.name.trim()) return false;
    return departments.some(
      d => d.id !== dept?.id && d.name.toLowerCase().trim() === form.name.toLowerCase().trim(),
    );
  }, [form.name, dept, departments]);

  /* Filter parent options to same branch only when scoped to a single branch */
  const parentOptions = useMemo(() => {
    return departments.filter(d => {
      if (d.id === dept?.id) return false;
      if (form.scope_type === 'SINGLE_BRANCH' && form.branch_id) return d.branch_id === form.branch_id;
      return true;
    });
  }, [departments, dept, form.scope_type, form.branch_id]);

  const setScopeType = (scope_type: ScopeType) => {
    setForm(f => ({
      ...f,
      scope_type,
      branch_id: scope_type === 'SINGLE_BRANCH' ? f.branch_id : '',
      branch_ids: scope_type === 'SELECTED_BRANCHES' ? f.branch_ids : [],
      parent_id: '',
    }));
    setErrors(prev => ({ ...prev, branch_id: '', branch_ids: '' }));
    setApiError('');
  };

  const toggleBranch = (branchId: string) => {
    setForm(f => {
      const nextIds = f.branch_ids.includes(branchId)
        ? f.branch_ids.filter(id => id !== branchId)
        : [...f.branch_ids, branchId];
      
      if (nextIds.length > 0) {
        setErrors(prev => ({ ...prev, branch_ids: '' }));
      }
      return { ...f, branch_ids: nextIds };
    });
    setApiError('');
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) {
      e.name = 'Department name is required';
    }
    if (!form.code.trim()) {
      e.code = 'Department code is required';
    }
    if (form.scope_type === 'SINGLE_BRANCH' && !form.branch_id) {
      e.branch_id = 'Branch is required';
    }
    if (form.scope_type === 'SELECTED_BRANCHES' && form.branch_ids.length === 0) {
      e.branch_ids = 'Select at least one branch';
    }
    if (!form.parent_id) {
      e.parent_id = 'Parent department is required';
    }
    if (!form.head_employee_id) {
      e.head_employee_id = 'Department head is required';
    }

    setErrors(e);
    setApiError('');

    if (Object.keys(e).length > 0) {
      const firstErrorKey = Object.keys(e)[0];
      setTimeout(() => {
        const el = document.getElementById(firstErrorKey) || document.getElementsByName(firstErrorKey)[0];
        if (el) {
          const focusable = el.tagName === 'DIV' ? el.querySelector('button, input, select') as HTMLElement : el;
          if (focusable) {
            focusable.focus();
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code,
        parent_id: form.parent_id || null,
        head_employee_id: form.head_employee_id || null,
        scope_type: form.scope_type,
        branch_id: form.scope_type === 'SINGLE_BRANCH' ? form.branch_id : null,
        branch_ids: form.scope_type === 'SELECTED_BRANCHES' ? form.branch_ids : [],
      };
      if (dept) {
        await api.put(`/departments/${dept.id}`, payload);
      } else {
        await api.post('/departments', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setApiError(err.response?.data?.message || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold">{dept ? 'Edit Department' : 'New Department'}</h2>
            <p className="text-xs text-muted-foreground">{dept ? 'Update department details' : 'Add a new department'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {apiError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{apiError}</p>
          )}

          {/* Scope Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Scope <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SCOPE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = form.scope_type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScopeType(opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-all ${
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] font-medium leading-tight">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Branch selection — depends on scope */}
          {form.scope_type === 'ORGANIZATION' && (
            <p className="text-xs text-muted-foreground bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              Available in every branch, including branches created in the future.
            </p>
          )}

          {form.scope_type === 'SELECTED_BRANCHES' && (
            <div id="branch_ids">
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Assigned Branches <span className="text-red-500">*</span>
              </label>
              <div className={`border rounded-xl divide-y divide-border max-h-48 overflow-y-auto ${errors.branch_ids ? 'border-red-400' : 'border-border'}`}>
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-2">No branches available.</p>
                ) : (
                  branches.map(b => (
                    <label key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={form.branch_ids.includes(b.id)}
                        onChange={() => toggleBranch(b.id)}
                        className="rounded"
                      />
                      {b.name}
                    </label>
                  ))
                )}
              </div>
              {errors.branch_ids && (
                <p className="text-xs text-red-500 mt-1">{errors.branch_ids}</p>
              )}
            </div>
          )}

          {form.scope_type === 'SINGLE_BRANCH' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Branch <span className="text-red-500">*</span>
              </label>
              <select
                id="branch_id"
                value={form.branch_id}
                onChange={e => {
                  setForm(f => ({ ...f, branch_id: e.target.value, parent_id: '' }));
                  setErrors(prev => ({ ...prev, branch_id: '' }));
                }}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.branch_id ? 'border-red-400' : 'border-border'}`}
              >
                <option value="">— Select Branch —</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branch_id && (
                <p className="text-xs text-red-500 mt-1">{errors.branch_id}</p>
              )}
            </div>
          )}

          {/* Department Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Department Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              value={form.name}
              onChange={e => {
                setForm(f => ({ ...f, name: e.target.value }));
                setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. F AND B SERVICE"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : nameConflict ? 'border-amber-400' : 'border-border'}`}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
            {nameConflict && !errors.name && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> A department with this name already exists.
              </p>
            )}
          </div>

          {/* Department Code */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Department Code <span className="text-red-500">*</span>
            </label>
            <input
              id="code"
              value={form.code}
              onChange={e => {
                setForm(f => ({ ...f, code: e.target.value }));
                setErrors(prev => ({ ...prev, code: '' }));
              }}
              placeholder="e.g. 102"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${errors.code ? 'border-red-400 focus:ring-red-400/30' : 'border-border focus:ring-primary/30'}`}
            />
            {errors.code && (
              <p className="text-xs text-red-500 mt-1">{errors.code}</p>
            )}
          </div>

          {/* Department Head */}
          <div id="head_employee_id">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Department Head <span className="text-red-500">*</span>
            </label>
            <ManagerSelectCombobox
              value={form.head_employee_id}
              onChange={v => {
                setForm(f => ({ ...f, head_employee_id: v }));
                setErrors(prev => ({ ...prev, head_employee_id: '' }));
              }}
              branchId={form.scope_type === 'SINGLE_BRANCH' ? form.branch_id : undefined}
              className={errors.head_employee_id ? 'ring-1 ring-red-400 rounded-lg' : ''}
            />
            {errors.head_employee_id && (
              <p className="text-xs text-red-500 mt-1">{errors.head_employee_id}</p>
            )}
          </div>

          {/* Parent Department */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Parent Department <span className="text-red-500">*</span>
            </label>
            <select
              id="parent_id"
              value={form.parent_id}
              onChange={e => {
                setForm(f => ({ ...f, parent_id: e.target.value }));
                setErrors(prev => ({ ...prev, parent_id: '' }));
              }}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.parent_id ? 'border-red-400' : 'border-border'}`}
            >
              <option value="">— None (top level) —</option>
              {parentOptions.map(d => (
                <option key={d.id} value={d.id}>{d.code ? `${d.code} – ` : ''}{d.name}</option>
              ))}
            </select>
            {errors.parent_id && (
              <p className="text-xs text-red-500 mt-1">{errors.parent_id}</p>
            )}
            {form.scope_type === 'SINGLE_BRANCH' && form.branch_id && (
              <p className="text-xs text-muted-foreground mt-1">
                Showing departments from the selected branch only.
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            {dept ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sort header helper ───────────────────────────────────────────────────── */
function SortTh({
  col, current, dir, onSort, children,
}: {
  col: SortKey; current: SortKey; dir: 'asc' | 'desc'; onSort: (c: SortKey) => void; children: React.ReactNode;
}) {
  const active = col === current;
  return (
    <TableHead
      className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3 opacity-30" />}
      </span>
    </TableHead>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [headFilter, setHeadFilter] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [headEmployees, setHeadEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDrawer, setShowDrawer] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const depCheck = useDependencyCheck();
  const [dedupeResult, setDedupeResult] = useState<{ removed: number; groups: number } | null>(null);

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
    api.get('/employees/manager-select', { params: { limit: 500 } }).then(r => setHeadEmployees(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchDepartments(); }, [branchFilter, scopeFilter, headFilter]);

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (branchFilter) params.branch_id = branchFilter;
      if (scopeFilter) params.scope_type = scopeFilter;
      if (headFilter) params.head_employee_id = headFilter;
      const res = await api.get('/departments', { params });
      setDepartments(res.data.data || []);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to fetch departments:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ── Derived data ───────────────────────────────────────────────────────── */
  const branchNameById = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach(b => { map[b.id] = b.name; });
    return map;
  }, [branches]);

  const branchLabel = (d: Department) => {
    if (d.scope_type === 'ORGANIZATION') return 'Organization Wide';
    if (d.scope_type === 'SELECTED_BRANCHES') return (d.branch_ids || []).map(id => branchNameById[id] || '').filter(Boolean).join(', ');
    return d.branch_name || '';
  };

  const duplicateNames = useMemo(() => {
    const counts: Record<string, number> = {};
    departments.forEach(d => {
      const key = d.name.toLowerCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    });
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k));
  }, [departments]);

  const duplicateCount = useMemo(
    () => departments.filter(d => duplicateNames.has(d.name.toLowerCase().trim())).length,
    [departments, duplicateNames],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = q
      ? departments.filter(d =>
          d.name.toLowerCase().includes(q) ||
          (d.code || '').toLowerCase().includes(q) ||
          branchLabel(d).toLowerCase().includes(q) ||
          (d.parent_name || '').toLowerCase().includes(q) ||
          (d.head_employee_name || '').toLowerCase().includes(q),
        )
      : [...departments];

    list.sort((a, b) => {
      let av: any = a[sortKey] ?? '';
      let bv: any = b[sortKey] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, search, sortKey, sortDir, branchNameById]);

  /* ── Actions ────────────────────────────────────────────────────────────── */
  const handleSort = (col: SortKey) => {
    if (col === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)));
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    try {
      await api.post('/departments/bulk-delete', { ids: Array.from(selected) });
      fetchDepartments();
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteDept) return;
    setDeleting(true);
    try {
      await api.delete(`/departments/${deleteDept.id}`);
      setDeleteDept(null);
      fetchDepartments();
    } catch (err) {
      console.error('Failed to delete department:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeduplicate = async () => {
    setDeduping(true);
    try {
      const res = await api.post('/departments/deduplicate');
      setDedupeResult(res.data.data);
      fetchDepartments();
    } catch (err) {
      console.error('Deduplication failed:', err);
    } finally {
      setDeduping(false);
    }
  };

  const totalEmployees = departments.reduce((s, d) => s + Number(d.employee_count || 0), 0);
  const totalResigned  = departments.reduce((s, d) => s + Number(d.resigned_count  || 0), 0);

  return (
    <>
      {showDrawer && (
        <DeptDrawer
          dept={editDept}
          departments={departments}
          branches={branches}
          onClose={() => { setShowDrawer(false); setEditDept(null); }}
          onSaved={fetchDepartments}
        />
      )}

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Departments</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage organizational departments</p>
          </div>
          <Button onClick={() => { setEditDept(null); setShowDrawer(true); }}>
            Add Department
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center card-gradient-blue text-white shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold">{departments.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center card-gradient-emerald text-white shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold">{totalEmployees}</p>
                <p className="text-xs text-muted-foreground">Active Staff</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center card-gradient-amber text-white shrink-0">
                <UserMinus className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold">{totalResigned}</p>
                <p className="text-xs text-muted-foreground">Resigned</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${duplicateCount > 0 ? 'ring-1 ring-amber-300' : ''}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${duplicateCount > 0 ? 'bg-amber-500' : 'bg-muted'}`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold">{duplicateCount}</p>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Duplicate banner */}
        {duplicateCount > 0 && !dedupeResult && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">
                {duplicateCount} departments share duplicate names.
                Auto-cleanup keeps the most-staffed version and reassigns all employees.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0"
              onClick={handleDeduplicate}
              disabled={deduping}
            >
              {deduping ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Clean Up Duplicates
            </Button>
          </div>
        )}

        {/* Success banner */}
        {dedupeResult && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-sm text-emerald-800 font-medium">
              Cleaned up {dedupeResult.removed} duplicate{dedupeResult.removed !== 1 ? 's' : ''} across{' '}
              {dedupeResult.groups} group{dedupeResult.groups !== 1 ? 's' : ''}. Employees reassigned automatically.
            </p>
            <button onClick={() => setDedupeResult(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Table card */}
        <Card className="border-0 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search departments..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              value={scopeFilter}
              onChange={e => setScopeFilter(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="">All Scopes</option>
              {SCOPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={headFilter}
              onChange={e => setHeadFilter(e.target.value)}
              className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
            >
              <option value="">All Department Heads</option>
              {headEmployees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={handleBulkDelete}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 disabled:opacity-40"
            >
              Delete ({selected.size})
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </TableHead>
                <SortTh col="code" current={sortKey} dir={sortDir} onSort={handleSort}>Code</SortTh>
                <SortTh col="name" current={sortKey} dir={sortDir} onSort={handleSort}>Department Name</SortTh>
                <SortTh col="scope_type" current={sortKey} dir={sortDir} onSort={handleSort}>Scope</SortTh>
                <SortTh col="parent_name" current={sortKey} dir={sortDir} onSort={handleSort}>Parent</SortTh>
                <SortTh col="head_employee_name" current={sortKey} dir={sortDir} onSort={handleSort}>Department Head</SortTh>
                <SortTh col="employee_count" current={sortKey} dir={sortDir} onSort={handleSort}>Employees</SortTh>
                <SortTh col="resigned_count" current={sortKey} dir={sortDir} onSort={handleSort}>Resigned</SortTh>
                <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Loading departments...</p>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Building2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {search ? 'No departments match your search' : 'No departments found'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(dept => {
                  const isDuplicate = duplicateNames.has(dept.name.toLowerCase().trim());
                  return (
                    <TableRow
                      key={dept.id}
                      className={`transition-colors ${isDuplicate ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-muted/30'} ${selected.has(dept.id) ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(dept.id)}
                          onChange={() => toggleSelect(dept.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm font-mono font-medium text-primary">{dept.code || '—'}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{dept.name}</span>
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="w-2.5 h-2.5" /> Duplicate
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {dept.scope_type === 'ORGANIZATION' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                            <Globe className="w-3 h-3" />Organization Wide
                          </span>
                        ) : dept.scope_type === 'SELECTED_BRANCHES' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full w-fit">
                              <GitBranch className="w-3 h-3" />Selected Branches
                            </span>
                            <span className="text-[11px] text-muted-foreground">{branchLabel(dept) || '—'}</span>
                          </div>
                        ) : dept.branch_name ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            <GitBranch className="w-3 h-3" />{dept.branch_name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{dept.parent_name || '—'}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{dept.head_employee_name?.trim() || '—'}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-foreground">{Number(dept.employee_count || 0)}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-foreground">{Number(dept.resigned_count || 0)}</TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditDept(dept); setShowDrawer(true); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeleteDept(dept); depCheck.check('department', dept.id); }}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Footer row count */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {departments.length} departments
              {selected.size > 0 && ` · ${selected.size} selected`}
            </div>
          )}
        </Card>
      </div>

      {/* Delete — dependency-aware warning */}
      {deleteDept && (
        <DeleteWarningModal
          entityType="department"
          entityLabel="Department"
          isLoading={depCheck.isLoading}
          report={depCheck.report}
          onCancel={() => { setDeleteDept(null); depCheck.clear(); }}
          onConfirmDelete={handleDelete}
          isDeleting={deleting}
        />
      )}
    </>
  );
}
