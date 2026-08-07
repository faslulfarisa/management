'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { conversionApi, ConversionPreview, ConvertToEmployeePayload } from '@/lib/onboarding-api';

interface RefOption { id: string; name: string }
interface EmployeeOption { id: string; first_name: string; last_name: string }

export function EmployeeConversionDrawer({
  applicationId, preview, onClose, onConverted,
}: {
  applicationId: string;
  preview: ConversionPreview;
  onClose: () => void;
  onConverted: (employeeId: string) => void;
}) {
  const { prefill } = preview;
  const [branches, setBranches] = useState<RefOption[]>([]);
  const [departments, setDepartments] = useState<RefOption[]>([]);
  const [positions, setPositions] = useState<RefOption[]>([]);
  const [designations, setDesignations] = useState<RefOption[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<RefOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [roles, setRoles] = useState<RefOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [enableLogin, setEnableLogin] = useState(false);

  const [form, setForm] = useState<ConvertToEmployeePayload>({
    first_name: prefill.first_name,
    last_name: prefill.last_name,
    personal_email: prefill.personal_email ?? undefined,
    personal_phone: prefill.personal_phone ?? undefined,
    branch_id: prefill.branch_id ?? undefined,
    department_id: prefill.department_id ?? undefined,
    position_id: prefill.position_id ?? undefined,
    employment_type_id: prefill.employment_type_id ?? undefined,
    reporting_manager_id: prefill.reporting_manager_id ?? undefined,
    date_of_joining: prefill.date_of_joining ? prefill.date_of_joining.slice(0, 10) : '',
    bank_name: prefill.bank_name ?? undefined,
    bank_account_number: prefill.bank_account_number ?? undefined,
    ifsc_code: prefill.ifsc_code ?? undefined,
    account_type: prefill.account_type ?? undefined,
    upi_id: prefill.upi_id ?? undefined,
    emergency_contact: prefill.emergency_contact,
  });

  useEffect(() => {
    Promise.all([
      api.get('/branches', { params: { limit: 200 } }),
      api.get('/departments', { params: { limit: 200 } }),
      api.get('/positions', { params: { limit: 200 } }),
      api.get('/designations', { params: { limit: 200 } }),
      api.get('/employment-types', { params: { limit: 200 } }),
      api.get('/employees', { params: { limit: 500 } }),
      api.get('/roles', { params: { limit: 100 } }),
    ]).then(([b, d, p, des, et, e, r]) => {
      setBranches(b.data.data ?? []);
      setDepartments(d.data.data ?? []);
      setPositions(p.data.data ?? []);
      setDesignations(des.data.data ?? []);
      setEmploymentTypes(et.data.data ?? []);
      setEmployees(e.data.data ?? []);
      setRoles(r.data.data ?? []);
    }).catch(() => { /* dropdowns degrade gracefully to empty lists */ });
  }, []);

  const set = (key: keyof ConvertToEmployeePayload, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setFormError('');
    if (!form.date_of_joining) { setFormError('Date of joining is required'); return; }
    setSaving(true);
    try {
      const payload: ConvertToEmployeePayload = { ...form };
      if (!enableLogin) {
        delete payload.login_email; delete payload.login_password; delete payload.login_role; payload.enable_login = false;
      } else {
        payload.enable_login = true;
      }
      const employee = await conversionApi.convert(applicationId, payload);
      onConverted(employee.id);
      onClose();
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.response?.data?.error || 'Failed to convert candidate to employee');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Convert to Employee</h2>
            <p className="text-xs text-muted-foreground">Review and complete the employee record before creating it</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">First Name</label>
              <input value={form.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Last Name</label>
              <input value={form.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Personal Email</label>
              <input value={form.personal_email ?? ''} onChange={(e) => set('personal_email', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Personal Phone</label>
              <PhoneNumberInput value={form.personal_phone ?? ''} onChange={(value) => set('personal_phone', value || undefined)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Branch</label>
              <select value={form.branch_id ?? ''} onChange={(e) => set('branch_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Department</label>
              <select value={form.department_id ?? ''} onChange={(e) => set('department_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Position</label>
              <select value={form.position_id ?? ''} onChange={(e) => set('position_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Designation</label>
              <select value={form.designation_id ?? ''} onChange={(e) => set('designation_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Employment Type</label>
              <select value={form.employment_type_id ?? ''} onChange={(e) => set('employment_type_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reporting Manager</label>
              <select value={form.reporting_manager_id ?? ''} onChange={(e) => set('reporting_manager_id', e.target.value || undefined)} className={inputCls}>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Date of Joining <span className="text-red-500">*</span></label>
              <input type="date" value={form.date_of_joining ?? ''} onChange={(e) => set('date_of_joining', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Probation End Date</label>
              <input type="date" value={form.probation_end_date ?? ''} onChange={(e) => set('probation_end_date', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Bank Details</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Bank Name" value={form.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} className={inputCls} />
              <input placeholder="Account Number" value={form.bank_account_number ?? ''} onChange={(e) => set('bank_account_number', e.target.value)} className={inputCls} />
              <input placeholder="IFSC Code" value={form.ifsc_code ?? ''} onChange={(e) => set('ifsc_code', e.target.value)} className={inputCls} />
              <input placeholder="UPI ID" value={form.upi_id ?? ''} onChange={(e) => set('upi_id', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" checked={enableLogin} onChange={(e) => setEnableLogin(e.target.checked)} className="rounded border-border" />
              Create login account
            </label>
            {enableLogin && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <input placeholder="Login Email" value={form.login_email ?? ''} onChange={(e) => set('login_email', e.target.value)} className={inputCls} />
                <input type="password" placeholder="Temporary Password" value={form.login_password ?? ''} onChange={(e) => set('login_password', e.target.value)} className={inputCls} />
                <select value={form.login_role ?? ''} onChange={(e) => set('login_role', e.target.value || undefined)} className={`${inputCls} col-span-2`}>
                  <option value="">Select role…</option>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={submit} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Create Employee
          </button>
        </div>
      </div>
    </div>
  );
}
