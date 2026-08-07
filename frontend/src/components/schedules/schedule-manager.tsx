'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import Link from 'next/link';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import {
  CalendarDays, Clock, Users, Building2, Briefcase, Plus,
  X, Search, CheckCircle2, Loader2, Info, Layers, User, Hash,
  AlertCircle, ClipboardList, IndianRupee, SlidersHorizontal,
  Settings2, ArrowRight, LayoutGrid, ListChecks,
  Star, ExternalLink, UserX, ShieldX, Eye, GitBranch,
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
  {
    key: 'holiday_policy',
    label: 'Holiday Policy',
    icon: CalendarDays,
    gradient: 'from-cyan-500 to-teal-600',
    lightBg: 'bg-cyan-50',
    textColor: 'text-cyan-700',
    borderColor: 'border-cyan-200',
    description: 'Holiday calendars, public holidays, optional holidays',
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
  employee: 'Employee', designation: 'Designation', department: 'Department', branch: 'Branch', property: 'Property', organization: 'Organization',
};
const SCOPE_PLURALS: Record<string, string> = {
  employee: 'Employees', designation: 'Designations', department: 'Departments', branch: 'Branches', property: 'Properties', organization: 'Organization',
};
const SCOPE_ICONS: Record<string, any> = {
  employee: User, designation: Briefcase, department: Building2, branch: GitBranch, property: Hash, organization: Layers,
};
const SCOPE_PRIORITY: Record<string, number> = {
  employee: 100, designation: 50, department: 30, branch: 10, property: 10, organization: 0,
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

  useEffect(() => {
    setTemplatesLoading(true);
    setSelectedTemplate(null);
    api.get('/templates', { params: { type: categoryKey } })
      .then(r => setTemplates(r.data.data || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [categoryKey]);

  useEffect(() => {
    if (step !== 2) return;
    setScopeLoading(true);
    setScopeIds(new Set());
    setScopeSearch('');
    const ep: Record<string, string> = {
      employee: '/employees', designation: '/designations',
      department: '/departments', branch: '/branches', property: '/properties',
    };
    if (scopeType === 'organization') {
      setScopeOptions([{ id: 'organization', name: 'Organization' }]);
      setScopeLoading(false);
      return;
    }
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
                  {Object.entries(SCOPE_LABELS)
                    .filter(([key]) => key === 'employee' || key === 'designation')
                    .map(([key, label]) => {
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

// ─── Exclusion Drawer ──────────────────────────────────────────────────────────

interface ExclusionDrawerProps {
  assignment: {
    id: string;
    template_name: string;
    scope_type: string;
    scope_name: string;
    template_type: string;
  };
  onClose: () => void;
}

function ExclusionDrawer({ assignment, onClose }: ExclusionDrawerProps) {
  const canAssign = useCan(PERMISSIONS.SCHEDULES_ASSIGN);
  const cat = TEMPLATE_CATEGORIES.find(c => c.key === assignment.template_type);
  const ScopeIcon = SCOPE_ICONS[assignment.scope_type] || Layers;

  // Effective employees + exclusions (loaded together)
  const [effectiveData, setEffectiveData] = useState<any>(null);
  const [effectiveLoading, setEffectiveLoading] = useState(true);

  // Employee search for adding new exclusions
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Per-exclusion removal tracking
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Per-employee adding tracking
  const [addingId, setAddingId] = useState<string | null>(null);

  const [reasonModal, setReasonModal] = useState<{ employeeId: string; name: string } | null>(null);
  const [reasonText, setReasonText] = useState('');

  const loadEffective = useCallback(async () => {
    setEffectiveLoading(true);
    try {
      const { data } = await api.get(`/template-assignments/${assignment.id}/effective-employees`);
      setEffectiveData(data.data);
    } catch {
      setEffectiveData(null);
    } finally {
      setEffectiveLoading(false);
    }
  }, [assignment.id]);

  useEffect(() => { loadEffective(); }, [loadEffective]);

  // Load employees for adding exclusions only when panel opens
  useEffect(() => {
    if (!showAddPanel || allEmployees.length > 0) return;
    setEmployeesLoading(true);
    api.get('/employees')
      .then(r => setAllEmployees(r.data.data || []))
      .catch(() => setAllEmployees([]))
      .finally(() => setEmployeesLoading(false));
  }, [showAddPanel]);

  const handleRemoveExclusion = async (exclusionId: string) => {
    setRemovingId(exclusionId);
    try {
      await api.delete(`/template-assignment-exclusions/${exclusionId}`);
      await loadEffective();
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddExclusion = async (employeeId: string, reason?: string) => {
    setAddingId(employeeId);
    try {
      await api.post(`/template-assignments/${assignment.id}/exclusions`, {
        employee_id: employeeId,
        reason: reason || undefined,
      });
      await loadEffective();
      setReasonModal(null);
      setReasonText('');
    } finally {
      setAddingId(null);
    }
  };

  const excludedIds = new Set<string>(
    (effectiveData?.exclusions || []).map((ex: any) => ex.employee_id)
  );

  const filteredEmployeesForAdd = allEmployees.filter(emp => {
    if (excludedIds.has(emp.id)) return false;
    if (!employeeSearch) return true;
    const q = employeeSearch.toLowerCase();
    return `${emp.first_name ?? ''} ${emp.last_name ?? ''} ${emp.employee_code ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <ShieldX className="w-4.5 h-4.5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground">Manage Exclusions</h2>
              <p className="text-xs text-muted-foreground truncate">
                {assignment.template_name} · <span className="capitalize">{assignment.scope_type}</span>: {assignment.scope_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assignment context badge */}
        <div className="px-6 py-3 border-b border-border shrink-0 bg-muted/30">
          <div className="flex items-center gap-3 flex-wrap">
            {cat && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cat.lightBg} ${cat.textColor} border ${cat.borderColor}`}>
                <cat.icon className="w-3 h-3" /> {cat.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              <ScopeIcon className="w-3 h-3" /> {SCOPE_LABELS[assignment.scope_type] || assignment.scope_type}: {assignment.scope_name}
            </span>
            <span className="text-xs text-muted-foreground">
              Excluded employees are skipped during template resolution.
            </span>
          </div>
        </div>

        {/* Assignment preview counters */}
        {!effectiveLoading && effectiveData && (
          <div className="px-6 py-4 border-b border-border shrink-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-2xl font-bold text-foreground">{effectiveData.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">In Scope</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-rose-50 border border-rose-200">
                <p className="text-2xl font-bold text-rose-600">{effectiveData.excluded_count}</p>
                <p className="text-xs text-rose-600/80 mt-0.5">Excluded</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-2xl font-bold text-emerald-600">{effectiveData.effective_count}</p>
                <p className="text-xs text-emerald-600/80 mt-0.5">Effective</p>
              </div>
            </div>
            {effectiveData.excluded_count > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {effectiveData.total} in scope − {effectiveData.excluded_count} excluded = <span className="font-semibold text-emerald-700">{effectiveData.effective_count} effectively assigned</span>
              </p>
            )}
          </div>
        )}

        {effectiveLoading && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground shrink-0">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading assignment data…
          </div>
        )}

        <div className="flex-1 overflow-y-auto">

          {/* ── Excluded employees list ──────────────────────────────────── */}
          <div className="px-6 pt-5 pb-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserX className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-bold text-foreground">Excluded Employees</h3>
                {effectiveData?.excluded_count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                    {effectiveData.excluded_count}
                  </span>
                )}
              </div>
              {canAssign && (
                <button
                  onClick={() => setShowAddPanel(p => !p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Exclusion
                </button>
              )}
            </div>

            {/* Add exclusion panel */}
            {showAddPanel && (
              <div className="mb-4 p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
                <p className="text-xs font-semibold text-rose-800">Search and select employees to exclude from this assignment:</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={employeeSearch}
                    onChange={e => setEmployeeSearch(e.target.value)}
                    placeholder="Search employees by name or code…"
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-border rounded-xl divide-y divide-border bg-white">
                  {employeesLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading employees…
                    </div>
                  ) : filteredEmployeesForAdd.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      {employeeSearch
                        ? 'No employees match your search'
                        : 'All employees are already excluded'}
                    </div>
                  ) : filteredEmployeesForAdd.slice(0, 30).map(emp => {
                    const name = `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() || 'Unknown';
                    const isAdding = addingId === emp.id;
                    return (
                      <div key={emp.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{name}</p>
                          <p className="text-[10px] text-muted-foreground">{emp.employee_code}{emp.department_name ? ` · ${emp.department_name}` : ''}</p>
                        </div>
                        {canAssign && (
                          <button
                            onClick={() => setReasonModal({ employeeId: emp.id, name })}
                            disabled={isAdding}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
                          >
                            {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                            Exclude
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {filteredEmployeesForAdd.length > 30 && (
                    <p className="px-3 py-2 text-[10px] text-muted-foreground text-center">
                      Showing first 30 — refine your search to find more.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Current exclusions */}
            {!effectiveLoading && (!effectiveData?.exclusions?.length) && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed rounded-xl">
                <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400 opacity-60" />
                <p className="text-sm font-medium">No exclusions yet</p>
                <p className="text-xs mt-1">All employees in this scope receive the template.</p>
              </div>
            )}

            {effectiveData?.exclusions?.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                {effectiveData.exclusions.map((ex: any) => (
                  <div key={ex.id} className="flex items-center gap-3 px-4 py-3 bg-rose-50/30 hover:bg-rose-50/60 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {(ex.employee_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{ex.employee_name}</p>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">EXCLUDED</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ex.employee_code}
                        {ex.reason && <span> · <em>{ex.reason}</em></span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Since {new Date(ex.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {canAssign && (
                      <button
                        onClick={() => handleRemoveExclusion(ex.id)}
                        disabled={removingId === ex.id}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50 transition-all"
                      >
                        {removingId === ex.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── All employees in scope (visibility panel) ───────────────── */}
          {!effectiveLoading && effectiveData?.employees?.length > 0 && (
            <div className="px-6 pt-4 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">All Employees in Scope</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                  {effectiveData.total}
                </span>
              </div>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
                {effectiveData.employees.map((emp: any) => (
                  <div
                    key={emp.id}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${emp.is_excluded ? 'bg-rose-50/40' : 'hover:bg-muted/20'}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${emp.is_excluded ? 'bg-rose-100 text-rose-600' : 'bg-muted text-muted-foreground'}`}>
                      {(emp.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-medium truncate ${emp.is_excluded ? 'text-rose-600 line-through' : 'text-foreground'}`}>{emp.name}</p>
                        {emp.is_excluded && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 shrink-0">EXCLUDED</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {emp.employee_code}
                        {emp.department_name && ` · ${emp.department_name}`}
                        {emp.designation_name && ` · ${emp.designation_name}`}
                      </p>
                    </div>
                    {canAssign && (emp.is_excluded ? (
                      <button
                        onClick={() => emp.exclusion && handleRemoveExclusion(emp.exclusion.id)}
                        disabled={!!removingId}
                        className="shrink-0 text-[10px] font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => setReasonModal({ employeeId: emp.id, name: emp.name })}
                        disabled={!!addingId}
                        className="shrink-0 text-[10px] font-semibold text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Exclude
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Reason modal */}
      {reasonModal && (
        <div className="absolute inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setReasonModal(null); setReasonText(''); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
                <UserX className="w-4.5 h-4.5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Exclude Employee</h3>
                <p className="text-xs text-muted-foreground">{reasonModal.name}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Reason <span className="font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                rows={3}
                placeholder="e.g. On deputation, different shift arrangement…"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setReasonModal(null); setReasonText(''); }}
                className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddExclusion(reasonModal.employeeId, reasonText)}
                disabled={addingId === reasonModal.employeeId}
                className="flex-1 bg-rose-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addingId === reasonModal.employeeId
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <UserX className="w-4 h-4" />}
                Confirm Exclusion
              </button>
            </div>
          </div>
        </div>
      )}
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

export function ScheduleManager({ activeTab }: { activeTab: 'overview' | 'assignments' | 'unassigned' }) {
  const canAssign = useCan(PERMISSIONS.SCHEDULES_ASSIGN);

  const [categoryStats, setCategoryStats] = useState<Record<string, { count: number; assignmentCount: number }>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState({ type: '', scope: '', search: '' });

  // Exclusion counts per assignment id (fetched lazily when tab is active)
  const [exclusionCounts, setExclusionCounts] = useState<Record<string, number>>({});

  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const [assignInitialCategory, setAssignInitialCategory] = useState<string | undefined>(undefined);

  // Exclusion drawer
  const [exclusionDrawerAssignment, setExclusionDrawerAssignment] = useState<any | null>(null);

  const [unassigned, setUnassigned] = useState<Record<string, any[]>>({ employee: [], designation: [], department: [], branch: [], property: [] });
  const [unassignedByCategory, setUnassignedByCategory] = useState<Record<string, Record<string, any[]>>>({});
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedLoaded, setUnassignedLoaded] = useState(false);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [unassignedScopeTab, setUnassignedScopeTab] = useState<'employee' | 'designation' | 'department' | 'branch' | 'property'>('employee');
  const [unassignedCategoryFilter, setUnassignedCategoryFilter] = useState<string>('all');

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

  // Fetch exclusion counts for all assignments once they're loaded
  const fetchExclusionCounts = useCallback(async (assignments: any[]) => {
    const counts: Record<string, number> = {};
    await Promise.all(assignments.map(async (a: any) => {
      try {
        const { data } = await api.get(`/template-assignments/${a.id}/exclusions`);
        counts[a.id] = (data.data || []).length;
      } catch {
        counts[a.id] = 0;
      }
    }));
    setExclusionCounts(counts);
  }, []);

  const fetchUnassigned = useCallback(async () => {
    setUnassignedLoading(true);
    try {
      const [empRes, desRes, deptRes, branchRes, propRes] = await Promise.all([
        api.get('/employees').catch(() => ({ data: { data: [] } })),
        api.get('/designations').catch(() => ({ data: { data: [] } })),
        api.get('/departments').catch(() => ({ data: { data: [] } })),
        api.get('/branches').catch(() => ({ data: { data: [] } })),
        api.get('/properties').catch(() => ({ data: { data: [] } })),
      ]);

      const assignedIds: Record<string, Set<string>> = {
        employee: new Set(), designation: new Set(), department: new Set(), branch: new Set(), property: new Set(),
      };
      const assignedIdsByCategory: Record<string, Record<string, Set<string>>> = {};
      TEMPLATE_CATEGORIES.forEach(cat => {
        assignedIdsByCategory[cat.key] = {
          employee: new Set(), designation: new Set(), department: new Set(), branch: new Set(), property: new Set(),
        };
      });

      await Promise.all(TEMPLATE_CATEGORIES.map(async cat => {
        try {
          const { data } = await api.get('/templates', { params: { type: cat.key } });
          const list: any[] = data.data || [];
          await Promise.all(list.map(async (t: any) => {
            try {
              const { data: ad } = await api.get('/template-assignments', { params: { template_id: t.id } });
              (ad.data || []).forEach((a: any) => {
                if (assignedIds[a.scope_type]) assignedIds[a.scope_type].add(a.scope_id);
                if (assignedIdsByCategory[cat.key][a.scope_type]) assignedIdsByCategory[cat.key][a.scope_type].add(a.scope_id);
              });
            } catch { /* silent */ }
          }));
        } catch { /* silent */ }
      }));

      const entitiesByScope: Record<string, any[]> = {
        employee: empRes.data.data || [],
        designation: desRes.data.data || [],
        department: deptRes.data.data || [],
        branch: branchRes.data.data || [],
        property: propRes.data.data || [],
      };

      setUnassigned({
        employee: entitiesByScope.employee.filter((e: any) => !assignedIds.employee.has(e.id)),
        designation: entitiesByScope.designation.filter((d: any) => !assignedIds.designation.has(d.id)),
        department: entitiesByScope.department.filter((d: any) => !assignedIds.department.has(d.id)),
        branch: entitiesByScope.branch.filter((b: any) => !assignedIds.branch.has(b.id)),
        property: entitiesByScope.property.filter((p: any) => !assignedIds.property.has(p.id)),
      });

      const byCategory: Record<string, Record<string, any[]>> = {};
      TEMPLATE_CATEGORIES.forEach(cat => {
        const ids = assignedIdsByCategory[cat.key];
        byCategory[cat.key] = {
          employee: entitiesByScope.employee.filter((e: any) => !ids.employee.has(e.id)),
          designation: entitiesByScope.designation.filter((d: any) => !ids.designation.has(d.id)),
          department: entitiesByScope.department.filter((d: any) => !ids.department.has(d.id)),
          branch: entitiesByScope.branch.filter((b: any) => !ids.branch.has(b.id)),
          property: entitiesByScope.property.filter((p: any) => !ids.property.has(p.id)),
        };
      });
      setUnassignedByCategory(byCategory);
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

  // After assignments load, fetch exclusion counts
  useEffect(() => {
    if (allAssignments.length > 0) {
      fetchExclusionCounts(allAssignments);
    }
  }, [allAssignments]);

  const handleAssignSaved = () => {
    fetchCategoryStats();
    if (assignmentsLoaded) fetchAllAssignments();
    if (unassignedLoaded) fetchUnassigned();
  };

  const openAssignDrawer = (categoryKey?: string) => {
    setAssignInitialCategory(categoryKey);
    setShowAssignDrawer(true);
  };

  const openExclusionDrawer = (assignment: any) => {
    setExclusionDrawerAssignment(assignment);
  };

  const handleExclusionDrawerClose = () => {
    setExclusionDrawerAssignment(null);
    // Refresh exclusion counts after potential changes
    if (allAssignments.length > 0) fetchExclusionCounts(allAssignments);
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

  const activeUnassignedByScope = unassignedCategoryFilter === 'all'
    ? unassigned
    : (unassignedByCategory[unassignedCategoryFilter] || { employee: [], designation: [], department: [], branch: [], property: [] });

  const filteredUnassigned = (activeUnassignedByScope[unassignedScopeTab] || []).filter(entity => {
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

      {exclusionDrawerAssignment && (
        <ExclusionDrawer
          assignment={exclusionDrawerAssignment}
          onClose={handleExclusionDrawerClose}
        />
      )}

      <div className="space-y-6">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Schedules</h1>
            <p className="text-muted-foreground">Workforce scheduling &amp; template assignment center</p>
          </div>
          {canAssign && (
            <Button onClick={() => openAssignDrawer()}>
              <Plus className="w-4 h-4 mr-2" /> Assign Template
            </Button>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            OVERVIEW TAB
            ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
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

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">Policy Template Library</h2>
                <Link href="/dashboard/templates" className="text-xs text-primary flex items-center gap-1 hover:underline">
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
                          {canAssign && (
                            <button
                              onClick={() => openAssignDrawer(cat.key)}
                              disabled={statsLoading || (stats?.count ?? 0) === 0}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all bg-gradient-to-r ${cat.gradient} text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              <Plus className="w-3.5 h-3.5" /> Assign
                            </button>
                          )}
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
              {canAssign && (
                <Button onClick={() => openAssignDrawer()}>
                  <Plus className="w-4 h-4 mr-2" /> New Assignment
                </Button>
              )}
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
                        <TableHead className="text-left p-4 font-medium normal-case text-muted-foreground">Exclusions</TableHead>
                        <TableHead className="p-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((a, idx) => {
                        const cat = TEMPLATE_CATEGORIES.find(c => c.key === a.template_type);
                        const Icon = SCOPE_ICONS[a.scope_type] || Layers;
                        const exclusionCount = exclusionCounts[a.id] ?? null;
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
                            <TableCell className="p-4">
                              {exclusionCount === null ? (
                                <span className="text-xs text-muted-foreground">…</span>
                              ) : exclusionCount > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  <UserX className="w-3 h-3" /> {exclusionCount}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="p-4">
                              <button
                                onClick={() => openExclusionDrawer(a)}
                                title="Manage employee exclusions"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors whitespace-nowrap"
                              >
                                <ShieldX className="w-3.5 h-3.5" /> Exclusions
                              </button>
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

            {unassignedLoading && (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Computing unassigned entities…
              </div>
            )}

            {unassignedLoaded && totalUnassigned === 0 && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-semibold text-emerald-800">
                  All entities have at least one template assigned.
                </p>
              </div>
            )}

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
                {canAssign && (
                  <Button size="sm" variant="outline" onClick={() => openAssignDrawer()} className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Assign Now
                  </Button>
                )}
              </div>
            )}

            {unassignedLoaded && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Differentiate by Template Type
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setUnassignedCategoryFilter('all')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${unassignedCategoryFilter === 'all' ? 'bg-foreground text-white border-foreground' : 'bg-white text-muted-foreground border-border hover:border-foreground/30'}`}
                  >
                    <Layers className="w-3.5 h-3.5" /> No Template At All
                  </button>
                  {TEMPLATE_CATEGORIES.map(cat => {
                    const active = unassignedCategoryFilter === cat.key;
                    const catCount = unassignedLoaded
                      ? Object.values(unassignedByCategory[cat.key] || {}).reduce((s: number, arr: any[]) => s + arr.length, 0)
                      : 0;
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setUnassignedCategoryFilter(cat.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${active ? `bg-gradient-to-r ${cat.gradient} text-white border-transparent shadow-sm` : `${cat.lightBg} ${cat.textColor} ${cat.borderColor} hover:opacity-80`}`}
                      >
                        <cat.icon className="w-3.5 h-3.5" /> {cat.label}
                        {catCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-white/70'}`}>
                            {catCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {unassignedCategoryFilter === 'all'
                    ? 'Showing entities with zero template assignments of any kind.'
                    : `Showing entities missing a ${TEMPLATE_CATEGORIES.find(c => c.key === unassignedCategoryFilter)?.label} assignment — they may already have other template types.`}
                </p>
              </div>
            )}

            {unassignedLoaded && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['employee', 'designation', 'department', 'branch', 'property'] as const).map(scope => {
                  const Icon = SCOPE_ICONS[scope];
                  const count = activeUnassignedByScope[scope].length;
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

            {unassignedLoaded && (
              <Card>
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {(['employee', 'designation', 'department', 'branch', 'property'] as const).map(scope => {
                        const count = activeUnassignedByScope[scope].length;
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
                          : unassignedCategoryFilter === 'all'
                            ? `All ${SCOPE_PLURALS[unassignedScopeTab].toLowerCase()} have at least one template assigned`
                            : `All ${SCOPE_PLURALS[unassignedScopeTab].toLowerCase()} have a ${TEMPLATE_CATEGORIES.find(c => c.key === unassignedCategoryFilter)?.label} assigned`}
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
                            {canAssign && (
                              <button
                                onClick={() => openAssignDrawer(unassignedCategoryFilter !== 'all' ? unassignedCategoryFilter : undefined)}
                                className="shrink-0 opacity-0 group-hover:opacity-100 text-xs font-semibold text-primary flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-all"
                              >
                                <Plus className="w-3 h-3" /> Assign
                              </button>
                            )}
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
