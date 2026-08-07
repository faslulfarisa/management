'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import ManagerSelectCombobox from '@/components/ManagerSelectCombobox';
import PhoneNumberInput from '@/components/employee/PhoneNumberInput';
import AddressFields, { AddressValue } from '@/components/employee/AddressFields';
import EmployeeCodeHistory from '@/components/employee/EmployeeCodeHistory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

const EMPTY_ADDRESS: AddressValue = {
  line1: '', line2: '', country: 'India', countryCode: 'IN', state: '', stateCode: '', city: '', pincode: '',
};

function parseAddress(addr: any): AddressValue {
  if (!addr || typeof addr !== 'object') return { ...EMPTY_ADDRESS };
  return {
    line1: addr.line1 || '',
    line2: addr.line2 || '',
    country: addr.country || 'India',
    countryCode: addr.countryCode || 'IN',
    state: addr.state || '',
    stateCode: addr.stateCode || '',
    city: addr.city || '',
    pincode: addr.pincode || '',
    text: addr.text || '',
  };
}

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { selectedTenantId } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    middle_name: '',
    date_of_birth: '',
    gender: '',
    marital_status: '',
    blood_group: '',
    nationality: 'Indian',
    personal_email: '',
    personal_phone: '',
    branch_id: '',
    department_id: '',
    employment_type_id: '',
    reporting_manager_id: '',
    position_id: '',
    date_of_joining: '',
    probation_end_date: '',
    confirmation_date: '',
    status: 'active',
    present_address: EMPTY_ADDRESS as AddressValue,
    permanent_address: EMPTY_ADDRESS as AddressValue,
    same_as_present: false,
    bank_name: '',
    bank_account_number: '',
    ifsc_code: '',
    pan_number: '',
    aadhaar_number: '',
    pf_number: '',
    uan_number: '',
    esic_number: '',
  });

  const initialEmployeeCode = useRef('');

  /* Fetch employee + static dropdown data */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [empRes, brRes, etRes, posRes] = await Promise.all([
          api.get(`/employees/${id}`),
          api.get('/branches'),
          api.get('/employment-types'),
          api.get('/positions'),
        ]);
        const emp = empRes.data.data;
        const presentAddress = parseAddress(emp.present_address);
        const permanentAddress = parseAddress(emp.permanent_address);
        initialEmployeeCode.current = emp.employee_code || '';
        setForm({
          employee_code: emp.employee_code || '',
          first_name: emp.first_name || '',
          last_name: emp.last_name || '',
          middle_name: emp.middle_name || '',
          date_of_birth: emp.date_of_birth ? emp.date_of_birth.split('T')[0] : '',
          gender: emp.gender || '',
          marital_status: emp.marital_status || '',
          blood_group: emp.blood_group || '',
          nationality: emp.nationality || 'Indian',
          personal_email: emp.personal_email || '',
          personal_phone: emp.personal_phone || '',
          branch_id: emp.branch_id || '',
          department_id: emp.department_id || '',
          employment_type_id: emp.employment_type_id || '',
          reporting_manager_id: emp.reporting_manager_id || '',
          position_id: emp.position_id || '',
          date_of_joining: emp.date_of_joining ? emp.date_of_joining.split('T')[0] : '',
          probation_end_date: emp.probation_end_date ? emp.probation_end_date.split('T')[0] : '',
          confirmation_date: emp.confirmation_date ? emp.confirmation_date.split('T')[0] : '',
          status: emp.status || 'active',
          present_address: presentAddress,
          permanent_address: permanentAddress,
          same_as_present: !!emp.present_address && !!emp.permanent_address
            && JSON.stringify(emp.present_address) === JSON.stringify(emp.permanent_address),
          bank_name: emp.bank_name || '',
          bank_account_number: emp.bank_account_number || '',
          ifsc_code: emp.ifsc_code || '',
          pan_number: emp.pan_number || '',
          aadhaar_number: emp.aadhaar_number || '',
          pf_number: emp.pf_number || '',
          uan_number: emp.uan_number || '',
          esic_number: emp.esic_number || '',
        });
        setBranches(brRes.data.data || []);
        setEmploymentTypes(etRes.data.data || []);
        setPositions(posRes.data.data || []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchData();
  }, [id]);

  /* Load departments filtered by branch */
  useEffect(() => {
    if (fetching) return;
    const params: any = {};
    if (form.branch_id) params.branch_id = form.branch_id;
    api.get('/departments', { params })
      .then(r => setDepartments(r.data.data || []))
      .catch(() => setDepartments([]));
  }, [form.branch_id, fetching]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (codeEditable && !form.employee_code.trim()) errs.employee_code = 'Required';
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.branch_id) errs.branch_id = 'Required';
    if (!form.department_id) errs.department_id = 'Required';
    if (!form.position_id) errs.position_id = 'Required';
    if (!form.date_of_joining) errs.date_of_joining = 'Required';

    if (form.date_of_joining) {
      if (form.probation_end_date && new Date(form.probation_end_date) <= new Date(form.date_of_joining)) {
        errs.probation_end_date = 'Probation end date must be after the joining date.';
      }
      if ((form as any).end_date && new Date((form as any).end_date) <= new Date(form.date_of_joining)) {
        errs.end_date = 'End date must be after the start date.';
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstErrorKey = Object.keys(errs)[0];
      const el = document.getElementById(firstErrorKey) || document.getElementsByName(firstErrorKey)[0];
      if (el) {
        const focusable = el.tagName === 'DIV' ? el.querySelector('button, input, select') as HTMLElement : el;
        if (focusable) {
          focusable.focus();
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setLoading(true);
    try {
      const payload: any = { ...form };
      delete payload.same_as_present;
      if (!codeEditable || payload.employee_code === initialEmployeeCode.current) {
        delete payload.employee_code;
      }
      Object.keys(payload).forEach(key => {
        if (key === 'present_address' || key === 'permanent_address') return;
        if (payload[key] === '') {
          delete payload[key];
        }
      });
      await api.put(`/employees/${id}`, payload);
      router.push(`/dashboard/hr/employees/${id}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBranchChange = (value: string) => {
    setForm(prev => ({ ...prev, branch_id: value, department_id: '' }));
  };

  const codeEditable = form.status !== 'confirmed';

  if (fetching) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit Employee</h1>
          <p className="text-muted-foreground">Update employee record</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Employee Code {codeEditable ? '*' : ''}</label>
              {codeEditable ? (
                <>
                  <Input
                    id="employee_code"
                    value={form.employee_code}
                    onChange={e => handleChange('employee_code', e.target.value)}
                    className={errors.employee_code ? 'border-red-400' : ''}
                  />
                  {errors.employee_code && <p className="text-xs text-red-500 mt-1">{errors.employee_code}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Changes are recorded in the code history below.</p>
                </>
              ) : (
                <div className="relative">
                  <Input value={form.employee_code} disabled className="pr-9" title="Locked — employee is confirmed" />
                  <Lock className="w-3.5 h-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">First Name *</label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={e => handleChange('first_name', e.target.value)}
                className={errors.first_name ? 'border-red-400' : ''}
              />
              {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Middle Name</label>
              <Input value={form.middle_name} onChange={e => handleChange('middle_name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Last Name *</label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={e => handleChange('last_name', e.target.value)}
                className={errors.last_name ? 'border-red-400' : ''}
              />
              {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date of Birth</label>
              <Input type="date" value={form.date_of_birth} onChange={e => handleChange('date_of_birth', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Gender</label>
              <select value={form.gender} onChange={e => handleChange('gender', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Marital Status</label>
              <select value={form.marital_status} onChange={e => handleChange('marital_status', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">Select</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Blood Group</label>
              <select value={form.blood_group} onChange={e => handleChange('blood_group', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">Select</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Personal Email</label>
              <Input type="email" value={form.personal_email} onChange={e => handleChange('personal_email', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Personal Phone</label>
              <PhoneNumberInput value={form.personal_phone} onChange={v => handleChange('personal_phone', v)} />
            </div>
          </CardContent>
        </Card>
 
        <Card className="mt-6">
          <CardHeader><CardTitle>Employee Code History</CardTitle></CardHeader>
          <CardContent>
            <EmployeeCodeHistory employeeId={id} />
          </CardContent>
        </Card>
 
        <Card className="mt-6">
          <CardHeader><CardTitle>Work Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Branch *</label>
              <select
                id="branch_id"
                value={form.branch_id}
                onChange={e => handleBranchChange(e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm ${errors.branch_id ? 'border-red-400' : ''}`}
              >
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {errors.branch_id && <p className="text-xs text-red-500 mt-1">{errors.branch_id}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Department *</label>
              <select
                id="department_id"
                value={form.department_id}
                onChange={e => handleChange('department_id', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm ${errors.department_id ? 'border-red-400' : ''}`}
              >
                <option value="">
                  {form.branch_id ? 'Select Department' : 'Select Branch first…'}
                </option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {errors.department_id && <p className="text-xs text-red-500 mt-1">{errors.department_id}</p>}
              {form.branch_id && departments.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No departments found for this branch.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Employment Type</label>
              <select value={form.employment_type_id} onChange={e => handleChange('employment_type_id', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">Select</option>
                {employmentTypes.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reporting Manager</label>
              <ManagerSelectCombobox
                value={form.reporting_manager_id}
                onChange={v => handleChange('reporting_manager_id', v)}
                branchId={form.branch_id}
                activeOrgKey={selectedTenantId}
                excludeId={id}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Position *</label>
              <select
                id="position_id"
                value={form.position_id}
                onChange={e => handleChange('position_id', e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-sm ${errors.position_id ? 'border-red-400' : ''}`}
              >
                <option value="">Select</option>
                {positions.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
              </select>
              {errors.position_id && <p className="text-xs text-red-500 mt-1">{errors.position_id}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date of Joining *</label>
              <Input
                id="date_of_joining"
                type="date"
                value={form.date_of_joining}
                onChange={e => handleChange('date_of_joining', e.target.value)}
                className={errors.date_of_joining ? 'border-red-400' : ''}
              />
              {errors.date_of_joining && <p className="text-xs text-red-500 mt-1">{errors.date_of_joining}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Probation End Date</label>
              <Input
                id="probation_end_date"
                type="date"
                value={form.probation_end_date}
                onChange={e => handleChange('probation_end_date', e.target.value)}
                className={errors.probation_end_date ? 'border-red-400' : ''}
              />
              {errors.probation_end_date && <p className="text-xs text-red-500 mt-1">{errors.probation_end_date}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Confirmation Date</label>
              <Input type="date" value={form.confirmation_date} onChange={e => handleChange('confirmation_date', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select value={form.status} onChange={e => handleChange('status', e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="confirmed">Confirmed</option>
                <option value="probation">Probation</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader><CardTitle>Address</CardTitle></CardHeader>
          <CardContent>
            <h3 className="text-sm font-semibold mb-3">Present / Current Address</h3>
            <div className="mb-6">
              <AddressFields
                value={form.present_address}
                onChange={addr => {
                  setForm(prev => ({
                    ...prev,
                    present_address: addr,
                    permanent_address: prev.same_as_present ? addr : prev.permanent_address,
                  }));
                }}
              />
            </div>

            <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.same_as_present}
                onChange={e => {
                  const checked = e.target.checked;
                  setForm(prev => ({
                    ...prev,
                    same_as_present: checked,
                    permanent_address: checked ? prev.present_address : prev.permanent_address,
                  }));
                }}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm text-foreground">Same as Present Address</span>
            </label>

            <h3 className="text-sm font-semibold mb-3">Permanent Address</h3>
            <AddressFields
              value={form.permanent_address}
              onChange={addr => setForm(prev => ({ ...prev, permanent_address: addr }))}
              disabled={form.same_as_present}
            />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader><CardTitle>Bank & Statutory Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Bank Name</label>
              <Input value={form.bank_name} onChange={e => handleChange('bank_name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Account Number</label>
              <Input value={form.bank_account_number} onChange={e => handleChange('bank_account_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">IFSC Code</label>
              <Input value={form.ifsc_code} onChange={e => handleChange('ifsc_code', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">PAN Number</label>
              <Input value={form.pan_number} onChange={e => handleChange('pan_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Aadhaar Number</label>
              <Input value={form.aadhaar_number} onChange={e => handleChange('aadhaar_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">PF Number</label>
              <Input value={form.pf_number} onChange={e => handleChange('pf_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">UAN Number</label>
              <Input value={form.uan_number} onChange={e => handleChange('uan_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ESIC Number</label>
              <Input value={form.esic_number} onChange={e => handleChange('esic_number', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
}
