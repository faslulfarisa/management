'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Loader2, X, Pencil, Trash2, MapPin, Cpu, Users, Search, GitBranch, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DeleteWarningModal } from '@/components/ui/delete-warning-modal';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';

interface Area {
  id: string;
  code: string;
  name: string;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  parent_id: string | null;
  parent_name: string | null;
  device_count: number;
  employee_count: number;
  resigned_count: number;
  fp_count: number;
  face_count: number;
  vlface_count: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  branch_id: string | null;
}

function AreaDrawer({
  area,
  areas,
  branches,
  onClose,
  onSaved,
}: {
  area: Area | null;
  areas: Area[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: area?.name || '',
    code: area?.code || '',
    branch_id: area?.branch_id || '',
    department_id: area?.department_id || '',
    parent_id: area?.parent_id || '',
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  /* Load departments whenever branch changes */
  useEffect(() => {
    if (!form.branch_id) {
      setDepartments([]);
      setForm(f => ({ ...f, department_id: '' }));
      return;
    }
    api.get('/departments', { params: { branch_id: form.branch_id } })
      .then(r => setDepartments(r.data.data || []))
      .catch(() => setDepartments([]));
  }, [form.branch_id]);

  /* Filter parent options to same branch */
  const parentOptions = useMemo(() => {
    return areas.filter(a => {
      if (a.id === area?.id) return false;
      if (form.branch_id) return a.branch_id === form.branch_id;
      return true;
    });
  }, [areas, area, form.branch_id]);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.branch_id)   e.branch_id = 'Branch is required';
    if (!form.name.trim()) e.name = 'Area name is required';

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
        ...form,
        branch_id:     form.branch_id     || null,
        department_id: form.department_id || null,
        parent_id:     form.parent_id     || null,
      };
      if (area) {
        await api.put(`/areas/${area.id}`, payload);
      } else {
        await api.post('/areas', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setApiError(err.response?.data?.message || 'Failed to save area');
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
            <h2 className="text-base font-bold">{area ? 'Edit Area' : 'New Area'}</h2>
            <p className="text-xs text-muted-foreground">{area ? 'Update area details' : 'Add a new physical zone'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {apiError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{apiError}</p>
          )}

          {/* Branch — required */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Branch <span className="text-red-500">*</span>
            </label>
            <select
              id="branch_id"
              value={form.branch_id}
              onChange={e => {
                setForm(f => ({ ...f, branch_id: e.target.value, department_id: '', parent_id: '' }));
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
            {!form.branch_id && !errors.branch_id && (
              <p className="text-xs text-muted-foreground mt-1">Areas must belong to a branch.</p>
            )}
          </div>

          {/* Department — optional, filtered by branch */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Department</label>
            <select
              value={form.department_id}
              onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
              disabled={!form.branch_id}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            >
              <option value="">— None —</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {!form.branch_id && (
              <p className="text-xs text-muted-foreground mt-1">Select a branch first to see its departments.</p>
            )}
          </div>

          {/* Area Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Area Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              value={form.name}
              onChange={e => {
                setForm(f => ({ ...f, name: e.target.value }));
                setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. Front Office"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.name ? 'border-red-400' : 'border-border'}`}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* Area Code */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Area Code</label>
            <input
              id="code"
              value={form.code}
              onChange={e => { setForm(f => ({ ...f, code: e.target.value })); setApiError(''); }}
              placeholder="e.g. 4"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Parent Area (filtered by branch) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Parent Area</label>
            <select
              value={form.parent_id}
              onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— None (top level) —</option>
              {parentOptions.map(a => (
                <option key={a.id} value={a.id}>{a.code ? `${a.code} – ` : ''}{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {area ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDrawer, setShowDrawer] = useState(false);
  const [editArea, setEditArea] = useState<Area | null>(null);
  const [deleteArea, setDeleteArea] = useState<Area | null>(null);
  const [deleting, setDeleting] = useState(false);
  const depCheck = useDependencyCheck();

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchAreas(); }, [branchFilter]);

  const fetchAreas = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (branchFilter) params.branch_id = branchFilter;
      const res = await api.get('/areas', { params });
      setAreas(res.data.data || []);
      setSelected(new Set());
    } catch (err) {
      console.error('Failed to fetch areas:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return areas;
    return areas.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.code || '').toLowerCase().includes(q) ||
      (a.branch_name || '').toLowerCase().includes(q) ||
      (a.department_name || '').toLowerCase().includes(q) ||
      (a.parent_name || '').toLowerCase().includes(q),
    );
  }, [areas, search]);

  const handleDelete = async () => {
    if (!deleteArea) return;
    setDeleting(true);
    try {
      await api.delete(`/areas/${deleteArea.id}`);
      setDeleteArea(null);
      fetchAreas();
    } catch (err) {
      console.error('Failed to delete area:', err);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(a => a.id)));
  };

  const totalDevices   = areas.reduce((s, a) => s + Number(a.device_count   || 0), 0);
  const totalEmployees = areas.reduce((s, a) => s + Number(a.employee_count || 0), 0);

  return (
    <>
      {showDrawer && (
        <AreaDrawer
          area={editArea}
          areas={areas}
          branches={branches}
          onClose={() => { setShowDrawer(false); setEditArea(null); }}
          onSaved={fetchAreas}
        />
      )}

      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Areas</h1>
            <p className="text-sm text-muted-foreground mt-1">Physical zones with biometric device and employee assignments</p>
          </div>
          <Button onClick={() => { setEditArea(null); setShowDrawer(true); }}>Add Area</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-blue text-white">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{areas.length}</p>
                <p className="text-xs text-muted-foreground">Total Areas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-emerald text-white">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDevices}</p>
                <p className="text-xs text-muted-foreground">Biometric Devices</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center card-gradient-amber text-white">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEmployees}</p>
                <p className="text-xs text-muted-foreground">Assigned Employees</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search areas..."
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
            <Button size="sm" variant="outline" disabled={selected.size === 0}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 disabled:opacity-40">
              Delete ({selected.size})
            </Button>
          </div>

          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-4 py-3">
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} className="rounded" />
                </TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Area Name</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Devices</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employees</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">FP</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Face</TableHead>
                <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">VLFace</TableHead>
                <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-16">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Loading areas...</p>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-16">
                    <MapPin className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {search || branchFilter ? 'No areas match your filters' : 'No areas found'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((area, idx) => (
                  <TableRow
                    key={area.id}
                    className="hover:bg-muted/30 transition-colors"
                    style={{ animation: `slideUp 0.3s ease ${idx * 0.03}s both` }}
                  >
                    <TableCell className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(area.id)} onChange={() => toggleSelect(area.id)} className="rounded" />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm font-medium text-primary">{area.code || '—'}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-medium text-foreground">{area.name}</TableCell>
                    <TableCell className="px-4 py-3">
                      {area.branch_name ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <GitBranch className="w-3 h-3" />{area.branch_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {area.department_name ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Building2 className="w-3 h-3" />{area.department_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{area.parent_name || '—'}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">{Number(area.device_count   || 0)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">{Number(area.employee_count || 0)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">{Number(area.fp_count       || 0)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">{Number(area.face_count     || 0)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-foreground">{Number(area.vlface_count   || 0)}</TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditArea(area); setShowDrawer(true); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setDeleteArea(area); depCheck.check('area', area.id); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Delete"
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

          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              Showing {filtered.length} of {areas.length} areas
              {selected.size > 0 && ` · ${selected.size} selected`}
            </div>
          )}
        </Card>
      </div>

      {/* Delete — dependency-aware warning */}
      {deleteArea && (
        <DeleteWarningModal
          entityType="area"
          entityLabel="Area"
          isLoading={depCheck.isLoading}
          report={depCheck.report}
          onCancel={() => { setDeleteArea(null); depCheck.clear(); }}
          onConfirmDelete={handleDelete}
          isDeleting={deleting}
        />
      )}
    </>
  );
}
