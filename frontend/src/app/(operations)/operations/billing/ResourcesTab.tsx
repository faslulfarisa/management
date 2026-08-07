'use client';

import { useEffect, useState } from 'react';
import { Plus, X, Loader2, Pencil, Power, PowerOff, MoreHorizontal, Check } from 'lucide-react';
import api from '@/lib/api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export interface Resource {
  id: string;
  name: string;
  slug: string;
  description: string;
  unit_name: string;
  price_per_unit_monthly: string | number;
  price_per_unit_yearly: string | number;
  is_active: boolean;
}

type ResourceFormState = {
  name: string;
  slug: string;
  description: string;
  unit_name: string;
  price_per_unit_monthly: number;
  price_per_unit_yearly: number;
};

const EMPTY_FORM: ResourceFormState = { name: '', slug: '', description: '', unit_name: '', price_per_unit_monthly: 0, price_per_unit_yearly: 0 };

function resourceToForm(res: Resource): ResourceFormState {
  return {
    name: res.name,
    slug: res.slug,
    description: res.description || '',
    unit_name: res.unit_name || '',
    price_per_unit_monthly: parseFloat(String(res.price_per_unit_monthly)) || 0,
    price_per_unit_yearly: parseFloat(String(res.price_per_unit_yearly)) || 0,
  };
}

function ResourceFormModal({ title, initial, onClose, onSaved }: { title: string; initial: ResourceFormState; onClose: () => void; onSaved: (payload: ResourceFormState) => Promise<void>; }) {
  const [form, setForm] = useState<ResourceFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.unit_name.trim()) { setError('Name, slug, and unit name are required'); return; }
    setSaving(true); setError('');
    try { await onSaved(form); onClose(); }
    catch (err: any) { setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resource Name</label>
              <input placeholder="e.g. Active Branches" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slug</label>
              <input placeholder="e.g. max-branches" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <input placeholder="Short description of the resource limit" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Name</label>
            <input placeholder="e.g. Branch, User, GB" value={form.unit_name} onChange={(e) => setForm({ ...form, unit_name: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly Unit Price (₹)</label>
              <input type="number" placeholder="0" value={form.price_per_unit_monthly} onChange={(e) => setForm({ ...form, price_per_unit_monthly: parseFloat(e.target.value) || 0 })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Yearly Unit Price (₹)</label>
              <input type="number" placeholder="0" value={form.price_per_unit_yearly} onChange={(e) => setForm({ ...form, price_per_unit_yearly: parseFloat(e.target.value) || 0 })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RowActions({ resource, onEdit, onToggleActive }: { resource: Resource; onEdit: () => void; onToggleActive: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            {resource.is_active ? (
              <button onClick={() => { setOpen(false); onToggleActive(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"><PowerOff className="w-3.5 h-3.5" /> Deactivate</button>
            ) : (
              <button onClick={() => { setOpen(false); onToggleActive(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition-colors"><Power className="w-3.5 h-3.5" /> Reactivate</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ResourcesTab() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editResource, setEditResource] = useState<Resource | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/billing/resources', { params: { includeInactive: 'true' } });
      setResources(res.data.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleToggleActive = async (resource: Resource) => { await api.put(`/billing/resources/${resource.id}`, { is_active: !resource.is_active }); load(); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Add Resource
        </button>
      </div>

      {showCreate && <ResourceFormModal title="Add Resource" initial={EMPTY_FORM} onClose={() => setShowCreate(false)} onSaved={async (payload) => { await api.post('/billing/resources', payload); load(); }} />}
      {editResource && <ResourceFormModal title={`Edit ${editResource.name}`} initial={resourceToForm(editResource)} onClose={() => setEditResource(null)} onSaved={async (payload) => { await api.put(`/billing/resources/${editResource.id}`, payload); load(); }} />}

      <div className="border border-border rounded-xl overflow-hidden bg-background">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="py-3 px-3">Resource</TableHead>
              <TableHead className="py-3 px-3">Unit</TableHead>
              <TableHead className="py-3 px-3">Monthly/Unit</TableHead>
              <TableHead className="py-3 px-3">Yearly/Unit</TableHead>
              <TableHead className="py-3 px-3">Status</TableHead>
              <TableHead className="py-3 px-3 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {loading ? ( <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow> ) 
            : resources.length === 0 ? ( <TableRow><TableCell colSpan={6} className="text-center py-10">No resources defined.</TableCell></TableRow> )
            : resources.map((resource) => (
                <TableRow key={resource.id} className="hover:bg-muted/30">
                  <TableCell className="py-3.5 px-3 font-medium">{resource.name}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">{resource.unit_name}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">₹{parseFloat(String(resource.price_per_unit_monthly)).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">₹{parseFloat(String(resource.price_per_unit_yearly)).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-3.5 px-3">
                    {resource.is_active 
                      ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Active</span>
                      : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200/60"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" /> Inactive</span>
                    }
                  </TableCell>
                  <TableCell className="py-3.5 px-3"><RowActions resource={resource} onEdit={() => setEditResource(resource)} onToggleActive={() => handleToggleActive(resource)} /></TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
