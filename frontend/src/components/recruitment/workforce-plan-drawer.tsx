'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { workforcePlansApi, WorkforcePlan, WorkforcePlanBreakdownItem } from '@/lib/workforce-plans-api';

interface RefOption { id: string; name: string }

export function WorkforcePlanDrawer({ plan, onClose, onSaved }: { plan?: WorkforcePlan | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!plan;
  const [branches, setBranches] = useState<RefOption[]>([]);
  const [departments, setDepartments] = useState<RefOption[]>([]);
  const [positions, setPositions] = useState<RefOption[]>([]);
  const [form, setForm] = useState({
    title: plan?.title || '', branch_id: plan?.branch_id || '', year: plan?.year?.toString() || String(new Date().getFullYear() + 1),
    notes: plan?.notes || '',
  });
  const [breakdown, setBreakdown] = useState<WorkforcePlanBreakdownItem[]>(plan?.breakdown?.length ? plan.breakdown : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/branches', { params: { limit: 200 } }).then((r) => setBranches(r.data.data));
    api.get('/departments', { params: { limit: 200 } }).then((r) => setDepartments(r.data.data));
    api.get('/positions', { params: { limit: 200 } }).then((r) => setPositions(r.data.data));
  }, []);

  const addRow = () => setBreakdown((b) => [...b, {}]);
  const updateRow = (idx: number, patch: Partial<WorkforcePlanBreakdownItem>) =>
    setBreakdown((b) => b.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const removeRow = (idx: number) => setBreakdown((b) => b.filter((_, i) => i !== idx));
  const optionalInt = (value: string) => (value === '' ? undefined : parseInt(value, 10) || 0);
  const optionalNumber = (value: string) => (value === '' ? undefined : parseFloat(value) || 0);

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.year) { setError('Year is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title, branch_id: form.branch_id || undefined, year: parseInt(form.year, 10),
        notes: form.notes || undefined, breakdown,
      };
      if (isEdit) await workforcePlansApi.update(plan.id, payload);
      else await workforcePlansApi.create(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save workforce plan');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Workforce Plan' : 'New Workforce Plan'}</h2>
            <p className="text-xs text-muted-foreground">Annual headcount &amp; budget breakdown by department/position</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Year <span className="text-red-500">*</span></label>
              <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Branch (leave blank for org-wide)</label>
            <select value={form.branch_id} onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
              <option value="">Org-wide</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Department/Position Breakdown</label>
              <button onClick={addRow} className="text-xs text-primary font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add Row</button>
            </div>
            <div className="space-y-2">
              {breakdown.map((row, i) => (
                <div key={i} className="border border-border rounded-xl p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={row.department_id || ''} onChange={(e) => updateRow(i, { department_id: e.target.value || undefined })} className="border border-border rounded-lg px-2.5 py-2 text-sm">
                      <option value="">Department…</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={row.position_id || ''} onChange={(e) => updateRow(i, { position_id: e.target.value || undefined })} className="border border-border rounded-lg px-2.5 py-2 text-sm">
                      <option value="">Position…</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Current HC</label>
                      <input type="number" value={row.current_headcount ?? ''} onChange={(e) => updateRow(i, { current_headcount: optionalInt(e.target.value) })} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Budgeted HC</label>
                      <input type="number" value={row.budgeted_headcount ?? ''} onChange={(e) => updateRow(i, { budgeted_headcount: optionalInt(e.target.value) })} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Planned Hires</label>
                      <input type="number" value={row.planned_hires ?? ''} onChange={(e) => updateRow(i, { planned_hires: optionalInt(e.target.value) })} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Budget Amount</label>
                      <input type="number" value={row.budget_amount ?? ''} onChange={(e) => updateRow(i, { budget_amount: optionalNumber(e.target.value) })} className="w-full border border-border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input value={row.justification || ''} onChange={(e) => updateRow(i, { justification: e.target.value })} placeholder="Justification" className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-sm" />
                    <button onClick={() => removeRow(i)} className="text-red-500 hover:bg-red-50 rounded-lg p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {breakdown.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No breakdown rows yet — click &quot;Add Row&quot;.</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
