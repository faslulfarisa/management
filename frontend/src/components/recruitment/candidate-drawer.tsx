'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { candidatesApi } from '@/lib/candidates-api';
import { vacanciesApi } from '@/lib/vacancies-api';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { AutoSaveNote, ContextualHelp } from '@/components/recruitment/recruitment-ux';

const CANDIDATE_DRAFT_KEY = 'recruitment:candidate-draft';

export function CandidateDrawer({ candidate, onClose, onSaved }: { candidate?: any; onClose: () => void; onSaved: () => void }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({
    first_name: candidate?.first_name || '', last_name: candidate?.last_name || '', email: candidate?.email || '', phone: candidate?.phone || '', current_company: candidate?.current_company || '', current_designation: candidate?.current_designation || '',
    experience_years: candidate?.experience_years ? String(candidate.experience_years) : '', expected_salary: candidate?.expected_salary ? String(candidate.expected_salary) : '', source: candidate?.source || 'walk_in', vacancy_id: '',
  });

  useEffect(() => {
    Promise.all([
      vacanciesApi.list({ status: 'open', limit: 100 }),
      vacanciesApi.list({ status: 'reopened', limit: 100 }),
    ]).then(([open, reopened]) => setJobs([...open.data, ...reopened.data])).catch(() => {});
  }, []);

  useEffect(() => {
    if (candidate) return; // Disable draft restoration when editing
    const raw = window.localStorage.getItem(CANDIDATE_DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft?.form && window.confirm('Restore your unsaved candidate draft?')) {
        setForm((current) => ({ ...current, ...draft.form }));
        setDraftSavedAt(draft.savedAt || null);
      }
    } catch {
      window.localStorage.removeItem(CANDIDATE_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!dirty || candidate) return; // Disable draft auto-save when editing
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      window.localStorage.setItem(CANDIDATE_DRAFT_KEY, JSON.stringify({ form, savedAt }));
      setDraftSavedAt(savedAt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [dirty, form]);

  const set = (k: string, v: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((current) => ({ ...current, [k]: '' }));
  };

  const close = () => {
    if (dirty && !window.confirm('Discard this unsaved candidate draft?')) return;
    onClose();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = 'First name is required';
    if (!form.last_name.trim()) e.last_name = 'Last name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        experience_years: form.experience_years ? parseFloat(form.experience_years) : undefined,
        expected_salary: form.expected_salary ? parseFloat(form.expected_salary) : undefined,
        vacancy_id: form.vacancy_id || undefined,
      } as any;
      
      if (candidate) {
        await candidatesApi.update(candidate.id, payload);
      } else {
        await candidatesApi.create(payload);
        window.localStorage.removeItem(CANDIDATE_DRAFT_KEY);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.message || err.response?.data?.error || 'Failed to add candidate' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div><h2 className="text-base font-bold text-foreground">{candidate ? 'Edit Candidate' : 'Add Candidate'}</h2><p className="text-xs text-muted-foreground">{candidate ? 'Update candidate profile' : 'Walk-in, agency, or manual entry'}</p></div>
          <button onClick={close} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" title="Close drawer"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ContextualHelp title="Smart default">
            Source defaults to walk-in for manual entry. Pick an open job now to put the candidate directly into the pipeline.
          </ContextualHelp>
          <AutoSaveNote savedAt={draftSavedAt} />
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">First Name <span className="text-red-500">*</span></label>
              <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.first_name ? 'border-red-400' : 'border-border'}`} />
              {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Last Name <span className="text-red-500">*</span></label>
              <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.last_name ? 'border-red-400' : 'border-border'}`} />
              {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.email ? 'border-red-400' : 'border-border'}`} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Phone</label>
            <PhoneNumberInput value={form.phone} onChange={(value) => set('phone', value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Current Company</label>
              <input value={form.current_company} onChange={(e) => set('current_company', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Current Role</label>
              <input value={form.current_designation} onChange={(e) => set('current_designation', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Experience (yrs)</label>
              <input type="number" min="0" value={form.experience_years} onChange={(e) => set('experience_years', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Expected Salary (₹)</label>
              <input type="number" min="0" value={form.expected_salary} onChange={(e) => set('expected_salary', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Source</label>
              <select value={form.source} onChange={(e) => set('source', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="walk_in">Walk-in</option>
                <option value="agency">Agency</option>
                <option value="employee_referral">Employee Referral</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Apply to Job</label>
              <select value={form.vacancy_id} onChange={(e) => set('vacancy_id', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">None</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={close} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} {candidate ? 'Save Changes' : 'Add Candidate'}
          </button>
        </div>
      </div>
    </div>
  );
}
