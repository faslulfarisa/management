'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Briefcase, Plus, Pencil, Trash2, X, Search, Users, Shield,
  Loader2, CheckSquare, Square, LayoutList, Crown, UserCog,
  DollarSign, FileCheck, User, AlertTriangle, RotateCcw,
  ChevronDown, ChevronUp, Lock, Sparkles, Eye,
} from 'lucide-react';
import {
  Permission, PositionPreset,
  resolvePresetIds, resolveDependencies, getDependencyAdditions,
  getLockedIds, isPermissionSensitive, countSensitive,
  getAccessSummary, groupByTopModule, PERMISSION_GROUP_CARDS,
} from '@/lib/position-presets';
import { DeleteWarningModal } from '@/components/ui/delete-warning-modal';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Position {
  id: string;
  name: string;
  code?: string;
  description?: string;
  department_id?: string;
  department_name?: string;
  branch_id?: string;
  branch_name?: string;
  category?: string;
  level?: string;
  is_active: boolean;
  permission_count: number;
  assigned_count: number;
  created_at: string;
  permissions?: Permission[];
}

interface Department {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Executive:   <Crown className="w-5 h-5" />,
  Management:  <UserCog className="w-5 h-5" />,
  HR:          <Users className="w-5 h-5" />,
  Finance:     <DollarSign className="w-5 h-5" />,
  Operations:  <Briefcase className="w-5 h-5" />,
  Compliance:  <FileCheck className="w-5 h-5" />,
  Employee:    <User className="w-5 h-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  Executive:  'border-violet-500/40 bg-violet-500/8 hover:bg-violet-500/15 text-violet-700',
  Management: 'border-blue-500/40 bg-blue-500/8 hover:bg-blue-500/15 text-blue-700',
  HR:         'border-emerald-500/40 bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-700',
  Finance:    'border-green-500/40 bg-green-500/8 hover:bg-green-500/15 text-green-700',
  Operations: 'border-orange-500/40 bg-orange-500/8 hover:bg-orange-500/15 text-orange-700',
  Compliance: 'border-amber-500/40 bg-amber-500/8 hover:bg-amber-500/15 text-amber-700',
  Employee:   'border-gray-400/40 bg-gray-400/8 hover:bg-gray-400/15 text-gray-700',
};



const GROUP_COLORS: Record<string, string> = {
  blue:    'border-blue-200 bg-blue-50',
  emerald: 'border-emerald-200 bg-emerald-50',
  violet:  'border-violet-200 bg-violet-50',
  orange:  'border-orange-200 bg-orange-50',
  gray:    'border-gray-200 bg-gray-50',
  cyan:    'border-cyan-200 bg-cyan-50',
  red:     'border-red-200 bg-red-50',
};

/* ── Enhanced PermissionGrid with search + sensitive badges ────────── */
function PermissionGrid({
  allPerms,
  selected,
  onChange,
  lockedIds,
}: {
  allPerms: Permission[];
  selected: string[];
  onChange: (ids: string[]) => void;
  lockedIds: Set<string>;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return allPerms;
    const q = search.toLowerCase();
    return allPerms.filter(p =>
      p.module.toLowerCase().includes(q) || p.action.toLowerCase().includes(q)
    );
  }, [allPerms, search]);

  const grouped = useMemo(() =>
    filtered.reduce<Record<string, Permission[]>>((acc, p) => {
      (acc[p.module] ??= []).push(p);
      return acc;
    }, {}),
    [filtered],
  );

  const toggle = (id: string) => {
    if (lockedIds.has(id)) return;
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const toggleModule = (perms: Permission[]) => {
    const ids = perms.map(p => p.id);
    const idsSet = new Set(ids);
    const someOn = ids.some(id => selected.includes(id));
    if (someOn) {
      onChange(selected.filter(id => !idsSet.has(id)));
    } else {
      onChange([...new Set([...selected, ...ids])]);
    }
  };

  if (!allPerms.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No permissions defined yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search permissions..."
          className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No permissions match your search.</p>
      ) : (
        Object.entries(grouped).map(([module, perms]) => {
          const allOn = perms.every(p => selected.includes(p.id));
          const someOn = perms.some(p => selected.includes(p.id));
          return (
            <div key={module} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleModule(perms)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
              >
                {allOn ? (
                  <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                ) : someOn ? (
                  <div className="w-4 h-4 border-2 border-primary rounded-sm bg-primary/20 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-semibold text-foreground capitalize">{module}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {perms.filter(p => selected.includes(p.id)).length}/{perms.length}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-0 divide-y divide-border">
                {perms.map(perm => {
                  const isSelected = selected.includes(perm.id);
                  const isLocked = lockedIds.has(perm.id);
                  const isSensitive = isPermissionSensitive(perm);
                  return (
                    <button
                      key={perm.id}
                      onClick={() => toggle(perm.id)}
                      disabled={isLocked}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                      ) : isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-foreground flex-1">{perm.action}</span>
                      {isSensitive && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" aria-label="Sensitive permission" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ── Recommended mode: grouped cards ──────────────────────────────── */
function RecommendedPermissions({
  allPerms,
  selected,
  onChange,
  lockedIds,
  accessSummary,
  dependencyCount,
}: {
  allPerms: Permission[];
  selected: string[];
  onChange: (ids: string[]) => void;
  lockedIds: Set<string>;
  accessSummary: string[];
  dependencyCount: number;
}) {
  const [expandedPreview, setExpandedPreview] = useState(false);
  const byTop = useMemo(() => groupByTopModule(allPerms), [allPerms]);

  const toggleGroup = (perms: Permission[]) => {
    const ids = perms.map(p => p.id);
    const idsSet = new Set(ids);
    const someOn = ids.some(id => selected.includes(id));
    if (someOn) {
      onChange(selected.filter(id => !idsSet.has(id)));
    } else {
      onChange(resolveDependencies([...new Set([...selected, ...ids])], allPerms));
    }
  };

  return (
    <div className="space-y-3">
      {/* Access preview */}
      {accessSummary.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedPreview(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Access Preview</span>
            {expandedPreview ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />}
          </button>
          {expandedPreview && (
            <div className="px-4 py-3 space-y-1.5 bg-white">
              {accessSummary.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-1.5" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {PERMISSION_GROUP_CARDS.map(card => {
        const perms = byTop[card.key] ?? [];
        if (!perms.length) return null;
        const selectedInGroup = perms.filter(p => selected.includes(p.id)).length;
        const allOn = selectedInGroup === perms.length;
        const someOn = selectedInGroup > 0;
        const hasSensitive = perms.some(p => isPermissionSensitive(p) && selected.includes(p.id));
        const colorClass = GROUP_COLORS[card.color] ?? GROUP_COLORS.gray;

        return (
          <div key={card.key} className={`border rounded-xl p-4 ${colorClass} transition-all`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <button
                  onClick={() => toggleGroup(perms)}
                  className="shrink-0"
                >
                  {allOn ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : someOn ? (
                    <div className="w-5 h-5 border-2 border-primary rounded-sm bg-primary/20" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{card.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedInGroup} of {perms.length} permissions enabled</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasSensitive && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Sensitive
                  </span>
                )}
                {someOn && (
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold">
                    {selectedInGroup}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Dependency notice */}
      {dependencyCount > 0 && (
        <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{dependencyCount} permission{dependencyCount !== 1 ? 's' : ''} auto-added as required dependencies and locked.</span>
        </div>
      )}
    </div>
  );
}

/* ── Level Combobox (Creatable Select) ────────────────────────────── */
function LevelCombobox({
  levels,
  value,
  onChange,
}: {
  levels: string[];
  value: string;
  onChange: (val: string) => void;
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

  const filtered = levels.filter(l =>
    l.toLowerCase().includes(search.toLowerCase())
  );

  const showCreateOption = search.trim() !== '' && !levels.some(l => l.toLowerCase() === search.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="w-full flex items-center justify-between border border-border rounded-xl px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value || 'Select level (optional)'}
        </span>
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
                placeholder="Search or add custom level…"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && !showCreateOption ? (
              <p className="text-xs text-muted-foreground px-3 py-3 text-center">No levels found</p>
            ) : (
              filtered.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { onChange(l); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 text-left transition-colors ${
                    l === value ? 'bg-primary/5 text-primary font-medium' : ''
                  }`}
                >
                  <span>{l}</span>
                </button>
              ))
            )}
            
            {showCreateOption && (
              <button
                type="button"
                onClick={() => {
                  onChange(search.trim());
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-primary/5 border-t border-border/50 text-left transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Add &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Position Drawer ──────────────────────────────────────────────── */
function PositionDrawer({
  editPosition,
  departments,
  branches,
  allPerms,
  presets,
  positions,
  onClose,
  onSaved,
}: {
  editPosition: Position | null;
  departments: Department[];
  branches: Branch[];
  allPerms: Permission[];
  presets: PositionPreset[];
  positions: Position[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'permissions'>('details');
  const [permMode, setPermMode] = useState<'recommended' | 'advanced'>('recommended');
  const [form, setForm] = useState({
    name: editPosition?.name || '',
    code: editPosition?.code || '',
    description: editPosition?.description || '',
    department_id: editPosition?.department_id || '',
    branch_id: editPosition?.branch_id || '',
    category: editPosition?.category || '',
    level: editPosition?.level || '',
    is_active: editPosition?.is_active !== false,
  });
  const [selectedPerms, setSelectedPerms] = useState<string[]>(
    editPosition?.permissions?.map(p => p.id) || [],
  );
  const [presetApplied, setPresetApplied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const lockedIds = useMemo(() => getLockedIds(selectedPerms, allPerms), [selectedPerms, allPerms]);
  const dependencyAdditions = useMemo(() => getDependencyAdditions(selectedPerms, allPerms), [selectedPerms, allPerms]);
  const sensitiveCount = useMemo(() => countSensitive(selectedPerms, allPerms), [selectedPerms, allPerms]);
  const accessSummary = useMemo(() => getAccessSummary(selectedPerms, allPerms), [selectedPerms, allPerms]);

  const applyPreset = useCallback((category: string) => {
    const preset = presets.find(p => p.category === category);
    if (!preset) return;
    const ids = resolvePresetIds(preset.permissions, allPerms);
    setSelectedPerms(resolveDependencies(ids, allPerms));
    setPresetApplied(true);
    setTimeout(() => setPresetApplied(false), 3000);
  }, [presets, allPerms]);

  const handleCategoryChange = (category: string) => {
    setForm(f => ({ ...f, category }));
    if (category) applyPreset(category);
  };

  const levelOptions = useMemo(() => {
    const defaultLevels = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'C-Level'];
    const dbLevels = positions
      .map(p => p.level)
      .filter((l): l is string => typeof l === 'string' && l.trim() !== '');
    return Array.from(new Set([...defaultLevels, ...dbLevels]));
  }, [positions]);

  const resetToDefaults = () => {
    if (form.category) applyPreset(form.category);
  };

  const handlePermChange = (ids: string[]) => {
    setSelectedPerms(resolveDependencies(ids, allPerms));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Position name is required';
    if (!form.branch_id) e.branch_id = 'Please select a branch';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setTab('details');
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
      }, 100);
    }
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let positionId = editPosition?.id;
      if (editPosition) {
        await api.put(`/positions/${editPosition.id}`, form);
      } else {
        const res = await api.post('/positions', form);
        positionId = res.data.data.id;
      }
      await api.put(`/positions/${positionId}/permissions`, { permissionIds: selectedPerms });
      onSaved();
      onClose();
    } catch (err: any) {
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : (raw || 'Failed to save position');
      if (msg.toLowerCase().includes('code')) {
        setErrors({ code: msg });
        setTab('details');
      } else {
        setErrors({ _: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {editPosition ? 'Edit Position' : 'New Position'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {editPosition ? 'Update position details and permissions' : 'Define a position with intelligent permission presets'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['details', 'permissions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'details' ? (
                <span className="flex items-center justify-center gap-1.5">
                  <LayoutList className="w-3.5 h-3.5" />Details
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />Permissions
                  {selectedPerms.length > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold">
                      {selectedPerms.length}
                    </span>
                  )}
                  {sensitiveCount > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                      !
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Preset applied toast */}
        {presetApplied && (
          <div className="shrink-0 mx-6 mt-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            Permission preset applied — switch to Permissions tab to review or customize.
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {errors._ && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{errors._}</p>
          )}

          {tab === 'details' && (
            <div className="space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. HR Manager"
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`}
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Code</label>
                  <input
                    value={form.code}
                    onChange={e => {
                      setForm(f => ({ ...f, code: e.target.value.toUpperCase() }));
                      if (errors.code) setErrors(prev => { const { code, ...rest } = prev; return rest; });
                    }}
                    placeholder="e.g. HRM"
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.code ? 'border-red-400 focus:ring-red-400/30' : 'border-border'}`}
                  />
                  {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Briefly describe the responsibilities of this position..."
                  rows={2}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">All departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Branch / Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="branch_id"
                    value={form.branch_id}
                    onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      errors.branch_id ? 'border-red-400' : 'border-border'
                    }`}
                  >
                    <option value="">Select branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {errors.branch_id && <p className="text-xs text-red-500 mt-1">{errors.branch_id}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Level</label>
                  <LevelCombobox
                    levels={levelOptions}
                    value={form.level}
                    onChange={val => setForm(f => ({ ...f, level: val }))}
                  />
                </div>
              </div>

              {/* Category selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Position Category
                  <span className="ml-1.5 text-[10px] font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    Auto-selects permissions
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map(preset => {
                    const isSelected = form.category === preset.category;
                    const colorClass = isSelected
                      ? (CATEGORY_COLORS[preset.category] ?? 'border-primary/40 bg-primary/8 text-primary')
                        .replace('hover:bg-', 'bg-').replace('/8', '/20')
                      : (CATEGORY_COLORS[preset.category] ?? 'border-gray-200 bg-gray-50 text-gray-700');

                    return (
                      <button
                        key={preset.category}
                        type="button"
                        onClick={() => handleCategoryChange(
                          form.category === preset.category ? '' : preset.category
                        )}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? colorClass + ' ring-1 ring-offset-0 ring-current'
                            : colorClass
                        }`}
                      >
                        <span className="shrink-0 mt-0.5">
                          {CATEGORY_ICONS[preset.category] ?? <Briefcase className="w-5 h-5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-tight">{preset.label}</p>
                          <p className="text-[10px] text-current/70 mt-0.5 leading-tight line-clamp-2">{preset.description}</p>
                        </div>
                        {isSelected && (
                          <CheckSquare className="w-4 h-4 shrink-0 ml-auto mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {form.category && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <Sparkles className="w-3 h-3 inline mr-1 text-primary" />
                    Permissions pre-selected for <strong>{form.category}</strong>. Go to the Permissions tab to review or customize.
                  </p>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3 p-3 border border-border rounded-xl">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${form.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 mt-0.5 ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <div>
                  <p className="text-sm font-medium text-foreground">Active</p>
                  <p className="text-xs text-muted-foreground">Inactive positions cannot be assigned to users</p>
                </div>
              </div>
            </div>
          )}

          {tab === 'permissions' && (
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex border border-border rounded-xl p-1 gap-1">
                <button
                  onClick={() => setPermMode('recommended')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    permMode === 'recommended'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Recommended
                </button>
                <button
                  onClick={() => setPermMode('advanced')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    permMode === 'advanced'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Advanced
                </button>
              </div>

              {permMode === 'recommended' ? (
                <RecommendedPermissions
                  allPerms={allPerms}
                  selected={selectedPerms}
                  onChange={handlePermChange}
                  lockedIds={lockedIds}
                  accessSummary={accessSummary}
                  dependencyCount={dependencyAdditions.length}
                />
              ) : (
                <PermissionGrid
                  allPerms={allPerms}
                  selected={selectedPerms}
                  onChange={handlePermChange}
                  lockedIds={lockedIds}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedPerms.length} permission{selectedPerms.length !== 1 ? 's' : ''} selected
            </p>
            {sensitiveCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-2.5 h-2.5" />
                {sensitiveCount} sensitive
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {form.category && tab === 'permissions' && (
              <button
                onClick={resetToDefaults}
                className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
              {editPosition ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */
export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [presets, setPresets] = useState<PositionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState(false);
  const depCheck = useDependencyCheck();

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/positions');
      setPositions(res.data.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    Promise.all([
      api.get('/positions/permissions/all'),
      api.get('/departments'),
      api.get('/branches'),
      api.get('/positions/presets'),
    ]).then(([permRes, deptRes, branchRes, presetRes]) => {
      setAllPerms(permRes.data.data || []);
      setDepartments(deptRes.data.data || []);
      setBranches(branchRes.data.data || []);
      setPresets(presetRes.data.data || []);
    }).catch(() => {});
  }, [fetchPositions]);

  const openCreate = () => { setEditPosition(null); setShowDrawer(true); };

  const openEdit = async (pos: Position) => {
    try {
      const res = await api.get(`/positions/${pos.id}`);
      setEditPosition(res.data.data);
    } catch {
      setEditPosition(pos);
    }
    setShowDrawer(true);
  };

  const handleDelete = async () => {
    if (!deletePosition) return;
    setDeleting(true);
    try {
      await api.delete(`/positions/${deletePosition.id}`);
      setDeletePosition(null);
      fetchPositions();
    } catch {
      /* silent */
    } finally {
      setDeleting(false);
    }
  };

  const filtered = positions.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.department_name || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
      {showDrawer && (
        <PositionDrawer
          editPosition={editPosition}
          departments={departments}
          branches={branches}
          allPerms={allPerms}
          presets={presets}
          positions={positions}
          onClose={() => setShowDrawer(false)}
          onSaved={fetchPositions}
        />
      )}

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Positions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define company roles and control module access by position
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            New Position
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-blue text-white">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{positions.length}</p>
                <p className="text-xs text-muted-foreground">Total Positions</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-emerald text-white">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {positions.filter(p => p.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-amber text-white">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {positions.reduce((s, p) => s + (p.assigned_count || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">Assigned Users</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search positions by name, code, or department..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Position</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Permissions</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned</TableHead>
                <TableHead className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Loading positions...</p>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <Briefcase className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No positions match your search' : 'No positions defined yet'}
                    </p>
                    {!searchQuery && (
                      <button
                        onClick={openCreate}
                        className="mt-3 text-sm text-primary font-medium hover:underline"
                      >
                        Create your first position
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((pos, index) => (
                  <TableRow
                    key={pos.id}
                    className="hover:bg-muted/30 transition-colors"
                    style={{ animation: `slideUp 0.3s ease ${index * 0.04}s both` }}
                  >
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                          style={{
                            background: `linear-gradient(135deg, hsl(${(index * 60 + 200) % 360} 60% 46%), hsl(${(index * 60 + 220) % 360} 65% 58%))`,
                          }}
                        >
                          {pos.name?.charAt(0)?.toUpperCase() || 'P'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{pos.name}</p>
                          <div className="flex items-center gap-1.5">
                            {pos.code && (
                              <span className="text-[10px] font-mono text-muted-foreground">{pos.code}</span>
                            )}
                            {pos.level && (
                              <span className="text-[10px] text-muted-foreground/70">{pos.level}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {pos.category ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-primary/8 text-primary border-primary/20">
                          {pos.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                      {pos.department_name || <span className="text-muted-foreground/50">All</span>}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${pos.permission_count > 0 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                        <Shield className="w-3 h-3" />
                        {pos.permission_count}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${pos.assigned_count > 0 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                        <Users className="w-3 h-3" />
                        {pos.assigned_count}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${pos.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                        {pos.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(pos)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
                          title="Edit position"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setDeletePosition(pos); depCheck.check('position', pos.id); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-150"
                          title="Delete position"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Delete — dependency-aware warning */}
        {deletePosition && (
          <DeleteWarningModal
            entityType="position"
            entityLabel="Position"
            isLoading={depCheck.isLoading}
            report={depCheck.report}
            onCancel={() => { setDeletePosition(null); depCheck.clear(); }}
            onConfirmDelete={handleDelete}
            isDeleting={deleting}
          />
        )}
      </div>
    </>
  );
}
