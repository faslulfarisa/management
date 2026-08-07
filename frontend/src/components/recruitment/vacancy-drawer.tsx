'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X, Briefcase } from 'lucide-react';
import api from '@/lib/api';
import { vacanciesApi, Vacancy } from '@/lib/vacancies-api';
import { vacancySchema, VacancyFormData } from '@/lib/schemas/vacancy.schema';

interface RefOption { id: string; name: string }
interface EmployeeOption { id: string; first_name: string; last_name: string }

const DEFAULT_EMPLOYMENT_TYPES: RefOption[] = [
  { id: 'full_time', name: 'Full-time' },
  { id: 'part_time', name: 'Part-time' },
  { id: 'contract', name: 'Contract' },
  { id: 'internship', name: 'Internship' },
  { id: 'freelance', name: 'Freelance' },
  { id: 'temporary', name: 'Temporary' },
];

export function VacancyDrawer({
  vacancy, onClose, onSaved,
}: {
  vacancy?: Vacancy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!vacancy;
  const [branches, setBranches] = useState<RefOption[]>([]);
  const [departments, setDepartments] = useState<RefOption[]>([]);
  const [positions, setPositions] = useState<RefOption[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<RefOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [formError, setFormError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<VacancyFormData>({
    resolver: zodResolver(vacancySchema),
    defaultValues: vacancy ? {
      title: vacancy.title,
      branch_id: vacancy.branch_id ?? '',
      department_id: vacancy.department_id ?? '',
      position_id: vacancy.position_id ?? '',
      hiring_manager_id: vacancy.hiring_manager_id ?? '',
      recruiter_id: vacancy.recruiter_id ?? '',
      reporting_manager_id: vacancy.reporting_manager_id ?? '',
      employment_type_id: vacancy.employment_type_id ?? '',
      experience_min_years: vacancy.experience_min_years ?? undefined,
      experience_max_years: vacancy.experience_max_years ?? undefined,
      qualification: vacancy.qualification ?? '',
      salary_min: vacancy.salary_min ?? undefined,
      salary_max: vacancy.salary_max ?? undefined,
      number_of_positions: vacancy.number_of_positions ?? 1,
      target_start_date: vacancy.target_start_date ? vacancy.target_start_date.slice(0, 10) : '',
      target_close_date: vacancy.target_close_date ? vacancy.target_close_date.slice(0, 10) : '',
      description: vacancy.description ?? '',
      justification: vacancy.justification ?? '',
    } : { number_of_positions: 1 },
  });

  useEffect(() => {
    Promise.all([
      api.get('/branches', { params: { limit: 200 } }),
      api.get('/departments', { params: { limit: 200 } }),
      api.get('/positions', { params: { limit: 200 } }),
      api.get('/employment-types', { params: { limit: 200 } }),
      api.get('/employees', { params: { limit: 500 } }),
    ]).then(([b, d, p, et, e]) => {
      setBranches(b.data.data ?? []);
      setDepartments(d.data.data ?? []);
      setPositions(p.data.data ?? []);
      const apiTypes: RefOption[] = et.data.data ?? [];
      setEmploymentTypes(apiTypes.length > 0 ? apiTypes : DEFAULT_EMPLOYMENT_TYPES);
      setEmployees(e.data.data ?? []);
    }).catch(() => { setEmploymentTypes(DEFAULT_EMPLOYMENT_TYPES); });
  }, []);

  const onSubmit = async (data: VacancyFormData, alsoSubmitForApproval: boolean) => {
    setSaving(alsoSubmitForApproval ? 'submit' : 'draft');
    setFormError('');
    try {
      const payload = {
        ...data,
        branch_id: data.branch_id || undefined,
        department_id: data.department_id || undefined,
        position_id: data.position_id || undefined,
        hiring_manager_id: data.hiring_manager_id || undefined,
        recruiter_id: data.recruiter_id || undefined,
        reporting_manager_id: data.reporting_manager_id || undefined,
        employment_type_id: data.employment_type_id || undefined,
        target_start_date: data.target_start_date || undefined,
        target_close_date: data.target_close_date || undefined,
      };
      const saved = isEdit ? await vacanciesApi.update(vacancy!.id, payload) : await vacanciesApi.create(payload);
      if (alsoSubmitForApproval) await vacanciesApi.submit(saved.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.response?.data?.error || 'Failed to save vacancy');
    } finally {
      setSaving(null);
    }
  };

  const inputCls = (hasError?: boolean) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${hasError ? 'border-red-400' : 'border-border'}`;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{isEdit ? 'Edit Vacancy' : 'New Vacancy'}</h2>
            <p className="text-xs text-muted-foreground">Raise a vacancy request for approval</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <form className="flex-1 overflow-y-auto p-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</p>}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Job Title <span className="text-red-500">*</span></label>
            <input {...register('title')} placeholder="e.g. Senior Front Desk Executive" className={inputCls(!!errors.title)} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Branch</label>
              <select {...register('branch_id')} className={inputCls()}>
                <option value="">Select…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Department</label>
              <select {...register('department_id')} className={inputCls()}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Position</label>
              <select {...register('position_id')} className={inputCls()}>
                <option value="">Select…</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Employment Type</label>
              <select {...register('employment_type_id')} className={inputCls()}>
                <option value="">Select…</option>
                {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Hiring Manager</label>
              <select {...register('hiring_manager_id')} className={inputCls()}>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Recruiter</label>
              <select {...register('recruiter_id')} className={inputCls()}>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reporting Manager</label>
            <select {...register('reporting_manager_id')} className={inputCls()}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Min Experience (yrs)</label>
              <input type="number" min="0" step="0.5" {...register('experience_min_years')} className={inputCls()} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Max Experience (yrs)</label>
              <input type="number" min="0" step="0.5" {...register('experience_max_years')} className={inputCls(!!errors.experience_max_years)} />
              {errors.experience_max_years && <p className="text-xs text-red-500 mt-1">{String(errors.experience_max_years.message)}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Qualification</label>
            <input {...register('qualification')} placeholder="e.g. Bachelor's degree in Hospitality" className={inputCls()} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Min Salary (₹)</label>
              <input type="number" min="0" {...register('salary_min')} className={inputCls()} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Max Salary (₹)</label>
              <input type="number" min="0" {...register('salary_max')} className={inputCls(!!errors.salary_max)} />
              {errors.salary_max && <p className="text-xs text-red-500 mt-1">{String(errors.salary_max.message)}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Number of Positions <span className="text-red-500">*</span></label>
              <input type="number" min="1" {...register('number_of_positions')} className={inputCls(!!errors.number_of_positions)} />
              {errors.number_of_positions && <p className="text-xs text-red-500 mt-1">{errors.number_of_positions.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Target Start Date</label>
              <input type="date" {...register('target_start_date')} className={inputCls()} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Target Close Date</label>
              <input type="date" {...register('target_close_date')} className={inputCls()} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
            <textarea {...register('description')} rows={3} placeholder="Role overview and responsibilities…" className={`${inputCls()} resize-none`} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Justification</label>
            <textarea {...register('justification')} rows={2} placeholder="Why is this position needed?" className={`${inputCls()} resize-none`} />
          </div>
        </form>

        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            onClick={handleSubmit((d) => onSubmit(d, false))}
            disabled={saving !== null}
            className="border border-border rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50 flex items-center gap-2"
          >
            {saving === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save Draft
          </button>
          <button
            onClick={handleSubmit((d) => onSubmit(d, true))}
            disabled={saving !== null}
            className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving === 'submit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />} Save & Submit
          </button>
        </div>
      </div>
    </div>
  );
}
