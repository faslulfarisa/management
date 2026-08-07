'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { jobDescriptionsApi, JobDescription } from '@/lib/job-descriptions-api';

function TagListInput({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => { setText(value.join(', ')); }, [value]);
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split(',').map((s) => s.trim()).filter(Boolean))}
        placeholder={placeholder || 'Comma-separated…'}
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

export function JobDescriptionDrawer({
  jobDescription, onClose, onSaved,
}: {
  jobDescription?: JobDescription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!jobDescription;
  const [vacancies, setVacancies] = useState<{ id: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: jobDescription?.title ?? '',
    vacancy_id: jobDescription?.vacancy_id ?? '',
    summary: jobDescription?.summary ?? '',
    responsibilities: jobDescription?.responsibilities ?? '',
    qualifications: jobDescription?.qualifications ?? '',
    certifications: jobDescription?.certifications ?? '',
    work_location: jobDescription?.work_location ?? '',
    kras: (jobDescription?.kras ?? []) as string[],
    kpis: (jobDescription?.kpis ?? []) as string[],
    skills: (jobDescription?.skills ?? []) as string[],
    competencies: (jobDescription?.competencies ?? []) as string[],
    benefits: (jobDescription?.benefits ?? []) as string[],
    is_template: jobDescription?.is_template ?? false,
    template_name: jobDescription?.template_name ?? '',
  });

  useEffect(() => {
    api.get('/recruitment/vacancies', { params: { status: 'open', limit: 100 } })
      .then((r) => setVacancies(r.data.data.map((v: any) => ({ id: v.id, title: v.title }))))
      .catch(() => {});
  }, []);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, vacancy_id: form.vacancy_id || undefined, template_name: form.template_name || undefined };
      if (isEdit) await jobDescriptionsApi.update(jobDescription!.id, payload);
      else await jobDescriptionsApi.create(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to save job description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Job Description' : 'New Job Description'}</h2>
            <p className="text-xs text-muted-foreground">Define the role content for a vacancy or reusable template</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Linked Vacancy</label>
            <select value={form.vacancy_id} onChange={(e) => set('vacancy_id', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">None (template)</option>
              {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Summary</label>
            <textarea value={form.summary} onChange={(e) => set('summary', e.target.value)} rows={2} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Responsibilities</label>
            <textarea value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} rows={4} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <TagListInput label="KRAs (Key Result Areas)" value={form.kras} onChange={(v) => set('kras', v)} />
          <TagListInput label="KPIs" value={form.kpis} onChange={(v) => set('kpis', v)} />
          <TagListInput label="Skills Matrix" value={form.skills} onChange={(v) => set('skills', v)} />
          <TagListInput label="Competencies" value={form.competencies} onChange={(v) => set('competencies', v)} />
          <TagListInput label="Benefits" value={form.benefits} onChange={(v) => set('benefits', v)} />

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Qualifications</label>
            <input value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Certifications</label>
            <input value={form.certifications} onChange={(e) => set('certifications', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Work Location</label>
            <input value={form.work_location} onChange={(e) => set('work_location', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_template" checked={form.is_template} onChange={(e) => set('is_template', e.target.checked)} />
            <label htmlFor="is_template" className="text-sm text-foreground">Save as a reusable template</label>
          </div>
          {form.is_template && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Template Name</label>
              <input value={form.template_name} onChange={(e) => set('template_name', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
