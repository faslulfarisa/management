'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Pencil, Power, PowerOff, MoreHorizontal, Check } from 'lucide-react';
import api from '@/lib/api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export interface Module {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: string | number;
  price_yearly: string | number;
  setup_fee: string | number;
  is_standalone_allowed: boolean;
  is_active: boolean;
}

type ModuleFormState = {
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  setup_fee: number;
  is_standalone_allowed: boolean;
};

function moduleToForm(mod: Module): ModuleFormState {
  return {
    name: mod.name,
    slug: mod.slug,
    description: mod.description || '',
    price_monthly: parseFloat(String(mod.price_monthly)) || 0,
    price_yearly: parseFloat(String(mod.price_yearly)) || 0,
    setup_fee: parseFloat(String(mod.setup_fee)) || 0,
    is_standalone_allowed: mod.is_standalone_allowed || false,
  };
}

function ModuleFormModal({ title, initial, onClose, onSaved }: { title: string; initial: ModuleFormState; onClose: () => void; onSaved: (payload: Partial<ModuleFormState>) => Promise<void>; }) {
  const [form, setForm] = useState<ModuleFormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await onSaved({
        price_monthly: form.price_monthly,
        price_yearly: form.price_yearly,
        setup_fee: form.setup_fee,
        is_standalone_allowed: form.is_standalone_allowed,
      });
      onClose();
    }
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Module Name</label>
              <input value={form.name} disabled className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-muted-foreground cursor-not-allowed" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slug</label>
              <input value={form.slug} disabled className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-muted-foreground cursor-not-allowed" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <input value={form.description} disabled className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-muted-foreground cursor-not-allowed" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monthly (₹)</label>
              <input type="number" placeholder="0" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: parseFloat(e.target.value) || 0 })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Yearly (₹)</label>
              <input type="number" placeholder="0" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: parseFloat(e.target.value) || 0 })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Setup Fee (₹)</label>
              <input type="number" placeholder="0" value={form.setup_fee} onChange={(e) => setForm({ ...form, setup_fee: parseFloat(e.target.value) || 0 })} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm border border-border rounded-xl px-4 py-3 bg-background hover:bg-muted/30 cursor-pointer transition-colors w-max">
            <input type="checkbox" checked={form.is_standalone_allowed} onChange={(e) => setForm({ ...form, is_standalone_allowed: e.target.checked })} className="rounded border-border text-primary focus:ring-primary" />
            <span className="font-medium text-foreground">Standalone Allowed</span>
          </label>
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

function RowActions({ module, onEdit, onToggleActive }: { module: Module; onEdit: () => void; onToggleActive: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><MoreHorizontal className="w-4 h-4" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted/60 transition-colors"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            {module.is_active ? (
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

export default function ModulesTab() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModule, setEditModule] = useState<Module | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/billing/modules', { params: { includeInactive: 'true' } });
      setModules(res.data.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleToggleActive = async (module: Module) => { await api.put(`/billing/modules/${module.id}`, { is_active: !module.is_active }); load(); };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <p className="text-sm font-medium text-foreground">Platform modules</p>
        <p className="text-sm text-muted-foreground">These modules are available for plan setup and custom subscription assignments. Use edit to set prices or temporarily deactivate a module.</p>
      </div>

      {editModule && <ModuleFormModal title={`Edit ${editModule.name}`} initial={moduleToForm(editModule)} onClose={() => setEditModule(null)} onSaved={async (payload) => { await api.put(`/billing/modules/${editModule.id}`, payload); load(); }} />}

      <div className="border border-border rounded-xl overflow-hidden bg-background">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="py-3 px-3">Module</TableHead>
              <TableHead className="py-3 px-3">Monthly</TableHead>
              <TableHead className="py-3 px-3">Yearly</TableHead>
              <TableHead className="py-3 px-3">Status</TableHead>
              <TableHead className="py-3 px-3 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {loading ? ( <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow> ) 
            : modules.length === 0 ? ( <TableRow><TableCell colSpan={5} className="text-center py-10">No platform modules found. Run the latest backend migrations to seed the module catalog.</TableCell></TableRow> )
            : modules.map((module) => (
                <TableRow key={module.id} className="hover:bg-muted/30">
                  <TableCell className="py-3.5 px-3 font-medium">{module.name}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">₹{parseFloat(String(module.price_monthly)).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-3.5 px-3 text-muted-foreground">₹{parseFloat(String(module.price_yearly)).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="py-3.5 px-3">
                    {module.is_active 
                      ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Active</span>
                      : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200/60"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" /> Inactive</span>
                    }
                  </TableCell>
                  <TableCell className="py-3.5 px-3"><RowActions module={module} onEdit={() => setEditModule(module)} onToggleActive={() => handleToggleActive(module)} /></TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
