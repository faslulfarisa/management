'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import Link from 'next/link';
import {
  CalendarDays, Clock, Users, Building2, Briefcase, Plus,
  X, Search, CheckCircle2, Loader2, Info, Layers, User, Hash,
  AlertCircle, ClipboardList, IndianRupee, SlidersHorizontal,
  Settings2, ArrowRight, LayoutGrid, ListChecks,
  Star, ExternalLink, UserX, GitBranch,
} from 'lucide-react';

// ─── Template Category Config ─────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  {
    key: 'attendance_policy',
    label: 'Attendance Policy',
    icon: Clock,
    gradient: 'from-blue-500 to-blue-600',
    lightBg: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    description: 'Grace periods, late/early penalties, biometric rules',
  },
  {
    key: 'leave_policy',
    label: 'Leave Policy',
    icon: ClipboardList,
    gradient: 'from-emerald-500 to-teal-600',
    lightBg: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    description: 'Leave quotas, carry-forward, encashment rules',
  },
  {
    key: 'salary_structure',
    label: 'Salary Structure',
    icon: IndianRupee,
    gradient: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-200',
    description: 'Salary components, PF/ESI, bonus & gratuity',
  },
  {
    key: 'overtime_policy',
    label: 'Overtime Policy',
    icon: SlidersHorizontal,
    gradient: 'from-amber-500 to-orange-500',
    lightBg: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    description: 'OT eligibility, rate multiplier, caps, comp-off',
  },
  {
    key: 'shift_management',
    label: 'Shift Management',
    icon: CalendarDays,
    gradient: 'from-rose-500 to-pink-600',
    lightBg: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
    description: 'Shift timings, rotation, weekly off patterns',
  },
];

const getCategoryRoute = (key: string) => {
  switch (key) {
    case 'attendance_policy':
      return '/dashboard/templates/attendance-policy';
    case 'leave_policy':
      return '/dashboard/templates/leave-policy';
    case 'salary_structure':
      return '/dashboard/templates/salary-structure';
    case 'overtime_policy':
      return '/dashboard/templates/overtime-policy';
    case 'shift_management':
      return '/dashboard/templates/shifts';
    case 'holiday_policy':
      return '/dashboard/templates/holiday-policy';
    default:
      return '/dashboard/templates';
  }
};


const SCOPE_LABELS: Record<string, string> = {
  employee: 'Employee', designation: 'Designation', department: 'Department', property: 'Branch',
};
const SCOPE_PLURALS: Record<string, string> = {
  employee: 'Employees', designation: 'Designations', department: 'Departments', property: 'Branches',
};
const SCOPE_ICONS: Record<string, any> = {
  employee: User, designation: Briefcase, department: Building2, property: GitBranch,
};
const SCOPE_PRIORITY: Record<string, number> = {
  employee: 100, designation: 50, department: 30, property: 10,
};

// ─── Assign Drawer ─────────────────────────────────────────────────────────────

function AssignDrawer({
  onClose,
  onSaved,
  initialCategory,
}: {
  onClose: () => void;
  onSaved: () => void;
  initialCategory?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [categoryKey, setCategoryKey] = useState(initialCategory || 'attendance_policy');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [scopeType, setScopeType] = useState('employee');
  const [scopeIds, setScopeIds] = useState<Set<string>>(new Set());
  const [scopeOptions, setScopeOptions] = useState<any[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeSearch, setScopeSearch] = useState('');

  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [priority, setPriority] = useState(SCOPE_PRIORITY['employee']);

  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const category = TEMPLATE_CATEGORIES.find(c => c.key === categoryKey)!;

  // Load templates when category changes
  useEffect(() => {
    setTemplatesLoading(true);
    setSelectedTemplate(null);
    api.get('/templates', { params: { type: categoryKey } })
      .then(r => setTemplates(r.data.data || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [categoryKey]);

  // Load scope options when scope type or step changes
  useEffect(() => {
    if (step !== 2) return;
    setScopeLoading(true);
    setScopeIds(new Set());
    setScopeSearch('');
    const ep: Record<string, string> = {
      employee: '/employees', designation: '/designations',
      department: '/departments', property: '/properties',
    };
    api.get(ep[scopeType] || '/employees')
      .then(r => {
        const raw: any[] = r.data.data || [];
        const seen = new Set<string>();
        const deduped = raw.filter(item => {
          const lbl = scopeType === 'employee'
            ? `${item.first_name} ${item.last_name}`
            : item.name;
          if (seen.has(lbl)) return false;
          seen.add(lbl);
          return true;
        });
        setScopeOptions(deduped);
      })
      .catch(() => setScopeOptions([]))
      .finally(() => setScopeLoading(false));
  }, [scopeType, step]);

  const handleScopeTypeChange = (t: string) => {
    setScopeType(t);
    setScopeIds(new Set());
    setPriority(SCOPE_PRIORITY[t] || 10);
  };

  const toggleScopeId = (id: string) => {
    setScopeIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredScope = scopeOptions.filter(opt => {
    const lbl = scopeType === 'employee'
      ? `${opt.first_name ?? ''} ${opt.last_name ?? ''} ${opt.employee_code ?? ''}`.toLowerCase()
      : (opt.name ?? '').toLowerCase();
    return lbl.includes(scopeSearch.toLowerCase());
  });

  const selectAllFiltered = () => setScopeIds(prev => {
    const next = new Set(prev);
    filteredScope.forEach(o => next.add(o.id));
    return next;
  });

  const clearAll = () => setScopeIds(new Set());

  const getLabel = (opt: any) =>
    scopeType === 'employee'
      ? `${opt.first_name ?? ''} ${opt.last_name ?? ''}`.trim() || 'Unknown'
      : (opt.name ?? 'Unknown');

  const selectedOptions = scopeOptions.filter(o => scopeIds.has(o.id));

  const handleSubmit = async () => {
    if (!selectedTemplate || scopeIds.size === 0) return;
    setSaving(true);
    setErrors([]);
    const ids = Array.from(scopeIds);
    setSaveProgress({ done: 0, total: ids.length });
    const errs: string[] = [];
    for (const id of ids) {
      try {
        await api.post(`/templates/${selectedTemplate.id}/assign`, {
          template_type: categoryKey,
          scope_type: scopeType,
          scope_id: id,
          priority,
          ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
          ...(effectiveTo ? { effective_to: effectiveTo } : {}),
        });
      } catch (err: any) {
        const opt = scopeOptions.find(o => o.id === id);
        const name = opt ? getLabel(opt) : id;
        errs.push(`${name}: ${err.response?.data?.error || 'Failed'}`);
      }
      setSaveProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setSaving(false);
    if (errs.length === 0) {
      onSaved();
      onClose();
    } else {
      setErrors(errs);
      if (errs.length < ids.length) onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Assign Template</h2>
            <p className="text-xs text-muted-foreground">Apply a policy template to employees, departments, or roles</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-2">
          {(['Template', 'Targets', 'Schedule'] as const).map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                {i < 2 && <ArrowRight className="w-3 h-3 text-muted-foreground mx-1" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Step 1: Template selection ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Policy Category</label>
                <div className="grid grid-cols-1 gap-2">
                  {TEMPLATE_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const active = categoryKey === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setCategoryKey(cat.key)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${cat.gradient} text-white shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{cat.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                        </div>
                        {active && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Select Template</label>
                {templatesLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                    No templates found.{' '}
                    <Link href={getCategoryRoute(categoryKey)} className="text-primary underline">Create one</Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map(t => {
                      const isSel = selectedTemplate?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTemplate(isSel ? null : t)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${isSel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold ${isSel ? 'text-primary' : 'text-foreground'}`}>{t.name}</p>
                              {t.is_default && <Star className="w-3 h-3 text-amber-500" />}
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                          </div>
                          {isSel && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Multi-target scope selection ───────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Template badge */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${category.lightBg} ${category.borderColor}`}>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${category.gradient} flex items-center justify-center text-white shrink-0`}>
                  <category.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${category.textColor}`}>{category.label}</p>
                  <p className="text-sm font-bold text-foreground truncate">{selectedTemplate?.name}</p>
                </div>
              </div>

              {/* Scope type buttons */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Assign To</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(SCOPE_LABELS).map(([key, label]) => {
                    const Icon = SCOPE_ICONS[key];
                    const active = scopeType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleScopeTypeChange(key)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <p className={`text-xs font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                          <p className="text-[10px] text-muted-foreground">P{SCOPE_PRIORITY[key]}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Higher priority wins when multiple templates apply to the same employee.</p>
              </div>

              {/* Multi-select list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Select {SCOPE_PLURALS[scopeType]}
                  </label>
                  <div className="flex items-center gap-3">
                    {scopeIds.size > 0 && (
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {scopeIds.size} selected
                      </span>
                    )}
                    {filteredScope.length > 0 && scopeIds.size < filteredScope.length && (
                      <button type="button" onClick={selectAllFiltered} className="text-xs text-primary hover:underline">
                        Select all {filteredScope.length > scopeOptions.length ? `(${filteredScope.length})` : ''}
                      </button>
                    )}
                    {scopeIds.size > 0 && (
                      <button type="button" onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={scopeSearch}
                    onChange={e => setScopeSearch(e.target.value)}
                    placeholder={scopeLoading ? 'Loading…' : `Search ${SCOPE_PLURALS[scopeType].toLowerCase()}…`}
                    disabled={scopeLoading}
                    className="w-full pl-9 pr-8 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {scopeSearch && (
                    <button type="button" onClick={() => setScopeSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Checkable list */}
                <div className="border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto divide-y divide-border">
                  {scopeLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                    </div>
                  ) : filteredScope.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      {scopeSearch ? 'No results match your search' : `No ${SCOPE_PLURALS[scopeType].toLowerCase()} found`}
                    </div>
                  ) : filteredScope.map(opt => {
                    const lbl = getLabel(opt);
                    const sub = scopeType === 'employee'
                      ? (opt.employee_code || opt.designation_name || '')
                      : (opt.code || '');
                    const isSel = scopeIds.has(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleScopeId(opt.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSel ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                      >
                        {/* Checkbox indicator */}
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? 'bg-primary border-primary' : 'border-muted-foreground/40 bg-white'}`}>
                          {isSel && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${isSel ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {lbl.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-medium truncate ${isSel ? 'text-primary' : 'text-foreground'}`}>{lbl}</p>
                          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected chips */}
                {selectedOptions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedOptions.map(opt => (
                      <span
                        key={opt.id}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                      >
                        {getLabel(opt)}
                        <button
                          type="button"
                          onClick={() => toggleScopeId(opt.id)}
                          className="w-3.5 h-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Priority Score</label>
                <input
                  type="number"
                  value={priority}
                  onChange={e => setPriority(Number(e.target.value))}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Applied to all selected targets. Default for {SCOPE_LABELS[scopeType]}: {SCOPE_PRIORITY[scopeType]}.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3: Effective dates + review ───────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Assignment Summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Template:</span>
                    <span className="font-semibold text-foreground">{selectedTemplate?.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className={`font-semibold ${category.textColor}`}>{category.label}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Scope:</span>
                    <span className="font-semibold text-foreground">{SCOPE_LABELS[scopeType]}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Priority:</span>
                    <span className="font-semibold text-foreground">{priority}</span>
                  </div>
                </div>
                {/* Target chips */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Assigning to <span className="font-semibold text-foreground">{scopeIds.size} target{scopeIds.size !== 1 ? 's' : ''}</span>:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedOptions.map(opt => (
                      <span key={opt.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {getLabel(opt)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Effective dates */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <CalendarDays className="w-3.5 h-3.5" /> Effective Date Range
                  <span className="font-normal normal-case text-muted-foreground">(optional)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">From</label>
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={e => setEffectiveFrom(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground font-medium block mb-1">To (optional)</label>
                    <input
                      type="date"
                      value={effectiveTo}
                      min={effectiveFrom}
                      onChange={e => setEffectiveTo(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                {effectiveFrom && !effectiveTo && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1.5">
                    <Info className="w-3 h-3" /> No end date — assignments stay active until manually removed.
                  </p>
                )}
                {!effectiveFrom && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    No dates set — assignments take effect immediately.
                  </p>
                )}
              </div>

              {/* Save progress */}
              {saving && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Assigning {saveProgress.done} of {saveProgress.total}…
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden ml-2">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${saveProgress.total ? (saveProgress.done / saveProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && (
                <div className="text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 space-y-1">
                  <p className="font-semibold text-red-700">
                    {errors.length === scopeIds.size ? 'All assignments failed:' : `${errors.length} assignment${errors.length !== 1 ? 's' : ''} failed:`}
                  </p>
                  {errors.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                  {errors.length < Array.from(scopeIds).length && (
                    <p className="text-emerald-700 font-medium pt-1">
                      {Array.from(scopeIds).length - errors.length} succeeded.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => (s - 1) as any)}
              disabled={saving}
              className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
          )}
          <div className="flex-1" />
          {step === 2 && scopeIds.size > 0 && (
            <span className="text-xs text-muted-foreground">{scopeIds.size} selected</span>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as any)}
              disabled={(step === 1 && !selectedTemplate) || (step === 2 && scopeIds.size === 0)}
              className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : errors.length > 0 ? (
            <button onClick={onClose} className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              Assign to {scopeIds.size} Target{scopeIds.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Scope Chip ────────────────────────────────────────────────────────────────

function ScopeChip({ scopeType, scopeName, effectiveFrom, effectiveTo }: {
  scopeType: string; scopeName: string; effectiveFrom?: string; effectiveTo?: string;
}) {
  const Icon = SCOPE_ICONS[scopeType] || Layers;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{scopeName}</p>
        <p className="text-[10px] text-muted-foreground">
          {SCOPE_LABELS[scopeType]}
          {effectiveFrom && ` · from ${new Date(effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'unassigned'>('overview');

  // Template category stats (overview)
  const [categoryStats, setCategoryStats] = useState<Record<string, { count: number; assignmentCount: number }>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  // All assignments (flat, for assignments tab)
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState({ type: '', scope: '', search: '' });

  // Assign drawer
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const [assignInitialCategory, setAssignInitialCategory] = useState<string | undefined>(undefined);

  // Unassigned entities
  const [unassigned, setUnassigned] = useState<Record<string, any[]>>({ employee: [], designation: [], department: [], property: [] });
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedLoaded, setUnassignedLoaded] = useState(false);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [unassignedScopeTab, setUnassignedScopeTab] = useState<'employee' | 'designation' | 'department' | 'property'>('employee');

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchCategoryStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const results: Record<string, { count: number; assignmentCount: number }> = {};
      await Promise.all(TEMPLATE_CATEGORIES.map(async cat => {
        try {
          const { data } = await api.get('/templates', { params: { type: cat.key } });
          const list: any[] = data.data || [];
          let assignmentCount = 0;
          await Promise.all(list.map(async (t: any) => {
            try {
              const { data: ad } = await api.get('/template-assignments', { params: { template_id: t.id } });
              assignmentCount += (ad.data || []).length;
            } catch { /* silent */ }
          }));
          results[cat.key] = { count: list.length, assignmentCount };
        } catch {
          results[cat.key] = { count: 0, assignmentCount: 0 };
        }
      }));
      setCategoryStats(results);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchAllAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    try {
      const all: any[] = [];
      await Promise.all(TEMPLATE_CATEGORIES.map(async cat => {
        try {
          const { data } = await api.get('/templates', { params: { type: cat.key } });
          const list: any[] = data.data || [];
          await Promise.all(list.map(async (t: any) => {
            try {
              const { data: ad } = await api.get('/template-assignments', { params: { template_id: t.id } });
              const assigns: any[] = ad.data || [];
              assigns.forEach(a => all.push({
                ...a,
                template_name: t.name,
                template_type: cat.key,
                category_label: cat.label,
              }));
            } catch { /* silent */ }
          }));
        } catch { /* silent */ }
      }));
      setAllAssignments(all);
      setAssignmentsLoaded(true);
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const fetchUnassigned = useCallback(async () => {
    setUnassignedLoading(true);
    try {
      const [empRes, desRes, deptRes, propRes] = await Promise.all([
        api.get('/employees').catch(() => ({ data: { data: [] } })),
        api.get('/designations').catch(() => ({ data: { data: [] } })),
        api.get('/departments').catch(() => ({ data: { data: [] } })),
        api.get('/properties').catch(() => ({ data: { data: [] } })),
      ]);

      const assignedIds: Record<string, Set<string>> = {
        employee: new Set(), designation: new Set(), department: new Set(), property: new Set(),
      };

      await Promise.all(TEMPLATE_CATEGORIES.map(async cat => {
        try {
          const { data } = await api.get('/templates', { params: { type: cat.key } });
          const list: any[] = data.data || [];
          await Promise.all(list.map(async (t: any) => {
            try {
              const { data: ad } = await api.get('/template-assignments', { params: { template_id: t.id } });
              (ad.data || []).forEach((a: any) => {
                if (assignedIds[a.scope_type]) assignedIds[a.scope_type].add(a.scope_id);
              });
            } catch { /* silent */ }
          }));
        } catch { /* silent */ }
      }));

      setUnassigned({
        employee: (empRes.data.data || []).filter((e: any) => !assignedIds.employee.has(e.id)),
        designation: (desRes.data.data || []).filter((d: any) => !assignedIds.designation.has(d.id)),
        department: (deptRes.data.data || []).filter((d: any) => !assignedIds.department.has(d.id)),
        property: (propRes.data.data || []).filter((p: any) => !assignedIds.property.has(p.id)),
      });
      setUnassignedLoaded(true);
    } finally {
      setUnassignedLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategoryStats(); }, [fetchCategoryStats]);

  useEffect(() => {
    if (activeTab === 'assignments' && !assignmentsLoaded && !assignmentsLoading) {
      fetchAllAssignments();
    }
    if (activeTab === 'unassigned' && !unassignedLoaded && !unassignedLoading) {
      fetchUnassigned();
    }
  }, [activeTab]);

  const handleAssignSaved = () => {
    fetchCategoryStats();
    if (assignmentsLoaded) fetchAllAssignments();
    if (unassignedLoaded) fetchUnassigned();
  };

  const openAssignDrawer = (categoryKey?: string) => {
    setAssignInitialCategory(categoryKey);
    setShowAssignDrawer(true);
  };

  // ── Filtered assignments ──────────────────────────────────────────────────

  const filteredAssignments = allAssignments.filter(a => {
    if (assignmentFilter.type && a.template_type !== assignmentFilter.type) return false;
    if (assignmentFilter.scope && a.scope_type !== assignmentFilter.scope) return false;
    if (assignmentFilter.search) {
      const q = assignmentFilter.search.toLowerCase();
      const haystack = `${a.template_name} ${a.scope_name || ''} ${a.scope_type} ${a.category_label}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalTemplates = Object.values(categoryStats).reduce((s, c) => s + c.count, 0);
  const totalAssignments = Object.values(categoryStats).reduce((s, c) => s + c.assignmentCount, 0);
  const totalUnassigned = unassignedLoaded ? Object.values(unassigned).reduce((s, arr) => s + arr.length, 0) : 0;

  const filteredUnassigned = (unassigned[unassignedScopeTab] || []).filter(entity => {
    const q = unassignedSearch.toLowerCase();
    if (!q) return true;
    const label = unassignedScopeTab === 'employee'
      ? `${entity.first_name ?? ''} ${entity.last_name ?? ''} ${entity.employee_code ?? ''}`.toLowerCase()
      : `${entity.name ?? ''} ${entity.code ?? ''}`.toLowerCase();
    return label.includes(q);
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {showAssignDrawer && (
        <AssignDrawer
          initialCategory={assignInitialCategory}
          onClose={() => setShowAssignDrawer(false)}
          onSaved={handleAssignSaved}
        />
      )}

      <div className="space-y-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Schedules</h1>
            <p className="text-muted-foreground">Workforce scheduling &amp; template assignment center</p>
          </div>
          <Button onClick={() => openAssignDrawer()}>
            <Plus className="w-4 h-4 mr-2" /> Assign Template
          </Button>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="flex gap-1 border-b border-border">
          {([
            { id: 'overview' as const, label: 'Overview', icon: LayoutGrid },
            { id: 'assignments' as const, label: 'All Assignments', icon: ListChecks },
            { id: 'unassigned' as const, label: 'Unassigned', icon: UserX },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {id === 'unassigned' && unassignedLoaded && totalUnassigned > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  {totalUnassigned}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            OVERVIEW TAB
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Template Categories', value: TEMPLATE_CATEGORIES.length, icon: Settings2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Total Templates', value: statsLoading ? '—' : totalTemplates, icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Active Assignments', value: statsLoading ? '—' : totalAssignments, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">{label}</p>
                        <p className="text-2xl font-bold mt-0.5">{statsLoading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : value}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Template category cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">Policy Template Library</h2>
                <Link href="/dashboard/platform/templates" className="text-xs text-primary flex items-center gap-1 hover:underline">
                  Manage Templates <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {TEMPLATE_CATEGORIES.map(cat => {
                  const stats = categoryStats[cat.key];
                  const Icon = cat.icon;
                  return (
                    <Card key={cat.key} className="overflow-hidden hover:shadow-md transition-shadow">
                      <div className={`h-1.5 w-full bg-gradient-to-r ${cat.gradient}`} />
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center text-white shrink-0`}>
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-foreground">{cat.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{cat.description}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Templates: </span>
                            <span className="font-bold text-foreground">{statsLoading ? '…' : stats?.count ?? 0}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Assigned: </span>
                            <span className={`font-bold ${(stats?.assignmentCount ?? 0) > 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                              {statsLoading ? '…' : stats?.assignmentCount ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => openAssignDrawer(cat.key)}
                            disabled={statsLoading || (stats?.count ?? 0) === 0}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all bg-gradient-to-r ${cat.gradient} text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Assign
                          </button>
                          <Link
                            href={getCategoryRoute(cat.key)}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors ${cat.textColor}`}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            ASSIGNMENTS TAB
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            {/* Filters + actions */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={assignmentFilter.search}
                  onChange={e => setAssignmentFilter(f => ({ ...f, search: e.target.value }))}
                  placeholder="Search assignments…"
                  className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <select
                value={assignmentFilter.type}
                onChange={e => setAssignmentFilter(f => ({ ...f, type: e.target.value }))}
                className="border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">All Categories</option>
                {TEMPLATE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select
                value={assignmentFilter.scope}
                onChange={e => setAssignmentFilter(f => ({ ...f, scope: e.target.value }))}
                className="border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">All Scopes</option>
                {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <Button onClick={() => openAssignDrawer()}>
                <Plus className="w-4 h-4 mr-2" /> New Assignment
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {assignmentsLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading assignments…
                  </div>
                ) : filteredAssignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <ListChecks className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">
                      {assignmentsLoaded ? 'No assignments found' : 'No data loaded yet'}
                    </p>
                    <p className="text-xs mt-1">
                      {assignmentsLoaded ? 'Use "New Assignment" to assign a template' : 'Assignments will appear here'}
                    </p>
                  </div>
                ) : (
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Template</TableHead>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Category</TableHead>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Assigned To</TableHead>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Scope</TableHead>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Effective</TableHead>
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((a, idx) => {
                        const cat = TEMPLATE_CATEGORIES.find(c => c.key === a.template_type);
                        const Icon = SCOPE_ICONS[a.scope_type] || Layers;
                        return (
                          <TableRow key={`${a.id}-${idx}`}>
                            <TableCell className="p-4 font-medium text-foreground">{a.template_name}</TableCell>
                            <TableCell className="p-4">
                              {cat && (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${cat.lightBg} ${cat.textColor} border ${cat.borderColor}`}>
                                  <cat.icon className="w-3 h-3" /> {cat.label}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                  {(a.scope_name || '?').charAt(0).toUpperCase()}
                                </div>
                                <span className="text-foreground font-medium">{a.scope_name || a.scope_id}</span>
                              </div>
                            </TableCell>
                            <TableCell className="p-4">
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Icon className="w-3.5 h-3.5" />
                                {SCOPE_LABELS[a.scope_type] || a.scope_type}
                              </span>
                            </TableCell>
                            <TableCell className="p-4 text-xs text-muted-foreground">
                              {a.effective_from
                                ? new Date(a.effective_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : 'Immediate'}
                              {a.effective_to && ` → ${new Date(a.effective_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            </TableCell>
                            <TableCell className="p-4">
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                P{a.priority}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            UNASSIGNED TAB
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'unassigned' && (
          <div className="space-y-5">

            {/* Loading state */}
            {unassignedLoading && (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Computing unassigned entities…
              </div>
            )}

            {/* Alert banner — all clear */}
            {unassignedLoaded && totalUnassigned === 0 && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-semibold text-emerald-800">
                  All entities have at least one template assigned.
                </p>
              </div>
            )}

            {/* Alert banner — some unassigned */}
            {unassignedLoaded && totalUnassigned > 0 && (
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">
                    {totalUnassigned} {totalUnassigned === 1 ? 'entity has' : 'entities have'} no template assignments
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Assign a policy template to ensure proper payroll, attendance, and leave management.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openAssignDrawer()} className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Assign Now
                </Button>
              </div>
            )}

            {/* Scope summary cards */}
            {unassignedLoaded && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['employee', 'designation', 'department', 'property'] as const).map(scope => {
                  const Icon = SCOPE_ICONS[scope];
                  const count = unassigned[scope].length;
                  const active = unassignedScopeTab === scope;
                  return (
                    <button
                      key={scope}
                      onClick={() => { setUnassignedScopeTab(scope); setUnassignedSearch(''); }}
                      className={`p-3 rounded-xl border text-left transition-all ${active ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-border hover:border-amber-200 hover:bg-amber-50/40'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${count > 0 ? 'bg-amber-100' : 'bg-muted'}`}>
                          <Icon className={`w-3.5 h-3.5 ${count > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
                        </div>
                        <span className={`text-lg font-bold ${count > 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>{count}</span>
                      </div>
                      <p className="text-xs font-semibold text-foreground">{SCOPE_PLURALS[scope]}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{count > 0 ? 'unassigned' : 'all covered'}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Filtered list */}
            {unassignedLoaded && (
              <Card>
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Scope sub-tabs */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {(['employee', 'designation', 'department', 'property'] as const).map(scope => {
                        const count = unassigned[scope].length;
                        const Icon = SCOPE_ICONS[scope];
                        const active = unassignedScopeTab === scope;
                        return (
                          <button
                            key={scope}
                            onClick={() => { setUnassignedScopeTab(scope); setUnassignedSearch(''); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {SCOPE_PLURALS[scope]}
                            {count > 0 && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Search */}
                    <div className="relative ml-auto">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={unassignedSearch}
                        onChange={e => setUnassignedSearch(e.target.value)}
                        placeholder={`Search ${SCOPE_PLURALS[unassignedScopeTab].toLowerCase()}…`}
                        className="pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4">
                  {filteredUnassigned.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-400 opacity-60" />
                      <p className="text-sm font-medium">
                        {unassignedSearch
                          ? 'No results match your search'
                          : `All ${SCOPE_PLURALS[unassignedScopeTab].toLowerCase()} have at least one template assigned`}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredUnassigned.map(entity => {
                        const label = unassignedScopeTab === 'employee'
                          ? `${entity.first_name ?? ''} ${entity.last_name ?? ''}`.trim() || 'Unknown'
                          : (entity.name ?? 'Unknown');
                        const sub = unassignedScopeTab === 'employee'
                          ? entity.employee_code || entity.designation_name || ''
                          : entity.code || '';
                        return (
                          <div
                            key={entity.id}
                            className="group flex items-center gap-3 p-3 rounded-xl border border-border hover:border-amber-300 hover:bg-amber-50/40 transition-all"
                          >
                            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">
                              {label.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">{label}</p>
                              {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                            </div>
                            <button
                              onClick={() => openAssignDrawer()}
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-xs font-semibold text-primary flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-all"
                            >
                              <Plus className="w-3 h-3" /> Assign
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>
    </>
  );
}
