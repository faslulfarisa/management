'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import api from '@/lib/api';
import { candidatesApi } from '@/lib/candidates-api';

export function CandidateDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', current_company: '', current_designation: '',
    experience_years: '', expected_salary: '', source: 'walk_in', job_posting_id: '',
  });

  useEffect(() => {
    api.get('/recruitment/jobs', { params: { status: 'open' } }).then((r) => setJobs(r.data.data)).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      await candidatesApi.create({
        ...form,
        experience_years: form.experience_years ? parseFloat(form.experience_years) : undefined,
        expected_salary: form.expected_salary ? parseFloat(form.expected_salary) : undefined,
        job_posting_id: form.job_posting_id || undefined,
      } as any);
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
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div><h2 className="text-base font-bold text-foreground">Add Candidate</h2><p className="text-xs text-muted-foreground">Walk-in, agency, or manual entry</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
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
              <select value={form.job_posting_id} onChange={(e) => set('job_posting_id', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">None</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add Candidate
          </button>
        </div>
      </div>
    </div>
  );
}
