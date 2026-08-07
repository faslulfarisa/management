'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { offersApi, Offer, SalaryComponent } from '@/lib/offers-api';

interface RefOption { id: string; name: string }

export function OfferDrawer({ offer, onClose, onSaved }: { offer?: Offer | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!offer;
  const [applications, setApplications] = useState<Application[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<RefOption[]>([]);
  const [applicationId, setApplicationId] = useState(offer?.application_id || '');
  const [form, setForm] = useState({
    designation: offer?.designation || '', employment_type_id: offer?.employment_type_id || '',
    joining_date: offer?.joining_date?.slice(0, 10) || '', currency: offer?.currency || 'INR',
    ctc: offer?.ctc?.toString() || '', offer_letter_content: offer?.offer_letter_content || '',
  });
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>(offer?.salary_components || []);
  const [benefits, setBenefits] = useState<string[]>(offer?.benefits || []);
  const [benefitInput, setBenefitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) applicationsApi.list({ eligible_for_offer: 'true', limit: 200 } as any).then((r) => setApplications(r.data));
    api.get('/employment-types', { params: { limit: 200 } }).then((r) => setEmploymentTypes(r.data.data));
  }, [isEdit]);

  const addSalaryComponent = () => setSalaryComponents((c) => [...c, { name: '', amount: 0 }]);
  const updateSalaryComponent = (idx: number, patch: Partial<SalaryComponent>) =>
    setSalaryComponents((c) => c.map((sc, i) => (i === idx ? { ...sc, ...patch } : sc)));
  const removeSalaryComponent = (idx: number) => setSalaryComponents((c) => c.filter((_, i) => i !== idx));

  const addBenefit = () => { if (benefitInput.trim()) { setBenefits((b) => [...b, benefitInput.trim()]); setBenefitInput(''); } };
  const removeBenefit = (idx: number) => setBenefits((b) => b.filter((_, i) => i !== idx));

  const save = async () => {
    if (!isEdit && !applicationId) { setError('Select an application'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        designation: form.designation || undefined, employment_type_id: form.employment_type_id || undefined,
        joining_date: form.joining_date || undefined, currency: form.currency, ctc: form.ctc ? parseFloat(form.ctc) : undefined,
        salary_components: salaryComponents.filter((c) => c.name), benefits, offer_letter_content: form.offer_letter_content || undefined,
      };
      if (isEdit) await offersApi.update(offer.id, payload);
      else await offersApi.create({ application_id: applicationId, ...payload });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save offer');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Offer' : 'New Offer'}</h2>
            <p className="text-xs text-muted-foreground">Compensation, benefits, and offer letter content</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Application <span className="text-red-500">*</span></label>
              <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select candidate & job…</option>
                {applications.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.job_title || a.vacancy_title || 'Direct Application'}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Designation</label>
              <input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Employment Type</label>
              <select value={form.employment_type_id} onChange={(e) => setForm((f) => ({ ...f, employment_type_id: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select…</option>
                {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Joining Date</label>
              <input type="date" value={form.joining_date} onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">CTC</label>
              <input value={form.ctc} onChange={(e) => setForm((f) => ({ ...f, ctc: e.target.value }))} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Salary Components</label>
              <button onClick={addSalaryComponent} className="text-xs text-primary font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
            </div>
            <div className="space-y-2">
              {salaryComponents.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input value={c.name} onChange={(e) => updateSalaryComponent(i, { name: e.target.value })} placeholder="Name (e.g. Basic)" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm" />
                  <input type="number" value={c.amount} onChange={(e) => updateSalaryComponent(i, { amount: parseFloat(e.target.value) || 0 })} placeholder="Amount" className="w-28 border border-border rounded-lg px-2.5 py-2 text-sm" />
                  <button onClick={() => removeSalaryComponent(i)} className="text-red-500 hover:bg-red-50 rounded-lg p-2"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Benefits</label>
            <div className="flex gap-2 mb-2">
              <input value={benefitInput} onChange={(e) => setBenefitInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBenefit(); } }} placeholder="e.g. Health insurance" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm" />
              <button onClick={addBenefit} className="border border-border rounded-lg px-3 py-2 text-xs font-medium hover:bg-muted">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {benefits.map((b, i) => (
                <span key={i} className="px-2 py-1 bg-muted/60 rounded-full text-xs flex items-center gap-1">{b} <button onClick={() => removeBenefit(i)} className="hover:text-red-600">×</button></span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Offer Letter Content</label>
            <textarea value={form.offer_letter_content} onChange={(e) => setForm((f) => ({ ...f, offer_letter_content: e.target.value }))} rows={6} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
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
