'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { applicationsApi, candidatesApi } from '@/lib/candidates-api';
import { conversionApi } from '@/lib/onboarding-api';
import { useAuthStore } from '@/store/auth.store';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import ManagerSelectCombobox from '@/components/ManagerSelectCombobox';
import PhoneNumberInput from '@/components/employee/PhoneNumberInput';
import AddressFields, { AddressValue } from '@/components/employee/AddressFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft, ChevronRight, Loader2, Check,
  Upload, FileText, X, User, Briefcase, Phone,
  Shield, CreditCard, Fingerprint, FolderOpen, Lock,
  ImageIcon, AlertCircle, Eye, EyeOff, Plus, Trash2,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface DocEntry {
  id: string;
  document_type: string;
  name: string;
  file: File | null;
  preview: string | null;
  mime_type: string;
  size: number;
}

/* ── Constants ──────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'personal',    label: 'Personal',     short: 'Personal',    icon: User },
  { id: 'employment',  label: 'Employment',   short: 'Employment',  icon: Briefcase },
  { id: 'contact',     label: 'Contact',      short: 'Contact',     icon: Phone },
  { id: 'identity',    label: 'Identity',     short: 'Identity',    icon: Shield },
  { id: 'payroll',     label: 'Payroll',      short: 'Payroll',     icon: CreditCard },
  { id: 'attendance',  label: 'Biometrics',   short: 'Biometrics',  icon: Fingerprint },
  { id: 'documents',   label: 'Documents',    short: 'Documents',   icon: FolderOpen },
  { id: 'access',      label: 'App Access',   short: 'Access',      icon: Lock },
];

const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License',
  'Voter ID Card', 'Resume / CV', 'Offer Letter', 'Employment Contract',
  'Educational Certificate', 'Professional Certificate', 'Employee Photo',
  'Bank Passbook / Cheque', 'Background Check', 'Medical Certificate',
  'Other HR Document',
];

const ROLES = [
  { value: 'employee', label: 'Employee (Portal Access)' },
  { value: 'hr',       label: 'HR Manager' },
  { value: 'manager',  label: 'Department Manager' },
  { value: 'admin',    label: 'Admin' },
  { value: 'finance',  label: 'Finance / Payroll' },
];

/* ── Shared input styles ────────────────────────────────────────────────── */
const SEL = [
  'w-full border border-border rounded-lg px-3 py-2 text-sm bg-background',
  'focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground',
].join(' ');

/* ── Helper components ──────────────────────────────────────────────────── */
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Divider() {
  return <hr className="border-border my-6" />;
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function normalizeGender(value?: string | null) {
  const gender = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['male', 'female', 'other', 'prefer_not_to_say'].includes(gender) ? gender : '';
}

function addressFromCandidate(value: Record<string, any> | null | undefined, fallback: AddressValue): AddressValue {
  if (!value || typeof value !== 'object') return fallback;
  return {
    ...fallback,
    line1: value.line1 || value.address_line1 || value.street || value.address || '',
    line2: value.line2 || value.address_line2 || value.area || '',
    country: value.country || fallback.country,
    countryCode: value.countryCode || value.country_code || fallback.countryCode,
    state: value.state || fallback.state,
    stateCode: value.stateCode || value.state_code || fallback.stateCode,
    city: value.city || fallback.city,
    pincode: value.pincode || value.postal_code || value.zip || '',
  };
}

function Field({
  label, required, hint, children, className = '',
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 group"
    >
      <div className={[
        'relative w-11 h-6 rounded-full transition-colors duration-200',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      ].join(' ')}>
        <span className={[
          'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')} />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

function FilePreviewCard({ doc, onRemove, onTypeChange, onNameChange }: {
  doc: DocEntry;
  onRemove: () => void;
  onTypeChange: (v: string) => void;
  onNameChange: (v: string) => void;
}) {
  const isImage = doc.mime_type?.startsWith('image/');
  const isPdf   = doc.mime_type === 'application/pdf';
  const fmtSize = (bytes: number) =>
    bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;

  return (
    <div className="flex gap-3 p-3 border border-border rounded-xl bg-white hover:bg-muted/20 transition-colors group">
      {/* Preview */}
      <div className="w-14 h-14 rounded-lg border border-border overflow-hidden bg-muted/30 shrink-0 flex items-center justify-center">
        {isImage && doc.preview ? (
          <img src={doc.preview} alt="" className="w-full h-full object-cover" />
        ) : isPdf ? (
          <div className="flex flex-col items-center gap-0.5 text-red-500">
            <FileText className="w-5 h-5" />
            <span className="text-[9px] font-bold">PDF</span>
          </div>
        ) : (
          <FileText className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Fields */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={doc.document_type}
            onChange={e => onTypeChange(e.target.value)}
            className={SEL + ' text-xs py-1.5'}
          >
            <option value="">Select type…</option>
            {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input
            value={doc.name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Document name"
            className="h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {doc.file?.name} {doc.size ? `· ${fmtSize(doc.size)}` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function AddEmployeePage() {
  const router = useRouter();
  const { selectedTenantId } = useAuthStore();
  const canUploadDocuments = useCan(PERMISSIONS.DOCUMENTS_UPLOAD);
  const prefillAppliedRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving]       = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [dragOver, setDragOver]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Dropdown data */
  const [departments, setDepartments]     = useState<any[]>([]);
  const [branches, setBranches]           = useState<any[]>([]);
  const [employmentTypes, setEmpTypes]    = useState<any[]>([]);
  const [positions, setPositions]         = useState<any[]>([]);

  const emptyAddress: AddressValue = {
    line1: '', line2: '', country: 'India', countryCode: 'IN', state: '', stateCode: '', city: '', pincode: '',
  };

  /* Form state */
  const [form, setForm] = useState({
    /* Personal */
    employee_code: '', status: 'active',
    first_name: '', last_name: '', middle_name: '', nickname: '',
    gender: '', date_of_birth: '', nationality: 'Indian',
    religion: '', marital_status: '', blood_group: '',

    /* Employment */
    department_id: '', position_id: '',
    employment_type_id: '', branch_id: '',
    reporting_manager_id: '',
    date_of_joining: '', probation_end_date: '',

    /* Contact */
    personal_email: '', personal_phone: '', alternate_phone: '',
    office_email: '', office_telephone: '',
    present_address: emptyAddress, permanent_address: emptyAddress,
    same_as_present: false,

    /* Identity */
    aadhaar_number: '', pan_number: '', passport_number: '',
    driving_license_number: '', voter_id: '', employee_card_number: '',

    /* Payroll & Banking */
    bank_name: '', bank_account_number: '', ifsc_code: '',
    account_type: 'savings', upi_id: '', salary_payment_method: 'bank_transfer',
    pf_number: '', uan_number: '', esic_number: '',

    /* Attendance & Biometrics */
    biometric_employee_id: '', device_code: '', card_number: '',
  });

  /* Documents */
  const [documents, setDocuments] = useState<DocEntry[]>([]);

  /* Application access */
  const [enableLogin, setEnableLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: '', username: '', password: '', confirm_password: '', role: 'employee',
  });

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const applicationId = params.get('applicationId');
    if (params.get('source') !== 'recruitment' || !applicationId) return;

    prefillAppliedRef.current = true;
    Promise.all([
      applicationsApi.get(applicationId),
      conversionApi.preview(applicationId),
    ])
      .then(async ([application, preview]) => {
        const candidate = await candidatesApi.get(application.candidate_id);
        const personalEmail = preview.prefill.personal_email || candidate.email || application.candidate_email || '';
        const personalPhone = preview.prefill.personal_phone || candidate.phone || application.candidate_phone || '';

        setForm(prev => ({
          ...prev,
          first_name: prev.first_name || preview.prefill.first_name || candidate.first_name || application.first_name || '',
          last_name: prev.last_name || preview.prefill.last_name || candidate.last_name || application.last_name || '',
          gender: prev.gender || normalizeGender(candidate.gender),
          date_of_birth: prev.date_of_birth || toDateInput(candidate.date_of_birth),
          branch_id: prev.branch_id || preview.prefill.branch_id || '',
          department_id: prev.department_id || preview.prefill.department_id || '',
          position_id: prev.position_id || preview.prefill.position_id || '',
          employment_type_id: prev.employment_type_id || preview.prefill.employment_type_id || '',
          reporting_manager_id: prev.reporting_manager_id || preview.prefill.reporting_manager_id || '',
          date_of_joining: prev.date_of_joining || toDateInput(preview.prefill.date_of_joining),
          personal_email: prev.personal_email || personalEmail,
          personal_phone: prev.personal_phone || personalPhone,
          present_address: addressFromCandidate(candidate.address, prev.present_address),
          bank_name: prev.bank_name || preview.prefill.bank_name || '',
          bank_account_number: prev.bank_account_number || preview.prefill.bank_account_number || '',
          ifsc_code: prev.ifsc_code || preview.prefill.ifsc_code || '',
          account_type: prev.account_type || preview.prefill.account_type || 'savings',
          upi_id: prev.upi_id || preview.prefill.upi_id || '',
        }));

        setLoginForm(prev => ({
          ...prev,
          email: prev.email || personalEmail,
          username: prev.username || (personalEmail ? personalEmail.split('@')[0] : ''),
        }));
      })
      .catch(() => {
        prefillAppliedRef.current = false;
      });
  }, []);

  /* Fetch static dropdown data */
  useEffect(() => {
    Promise.all([
      api.get('/branches'),
      api.get('/employment-types'),
      api.get('/positions'),
    ]).then(([br, et, pos]) => {
      setBranches(br.data.data || []);
      setEmpTypes(et.data.data || []);
      setPositions((pos.data.data || []).filter((x: any) => x.is_active));
    }).catch(() => {});
  }, []);

  /* Load departments filtered by selected branch */
  useEffect(() => {
    const params: any = {};
    if (form.branch_id) params.branch_id = form.branch_id;
    api.get('/departments', { params })
      .then(r => setDepartments(r.data.data || []))
      .catch(() => setDepartments([]));
  }, [form.branch_id]);

  const set = useCallback((field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const setLogin = useCallback((field: string, value: any) => {
    setLoginForm(prev => ({ ...prev, [field]: value }));
  }, []);

  /* Fetch IFSC Details */
  const [ifscDetails, setIfscDetails] = useState<{ bank: string; branch: string } | null>(null);
  const [isFetchingIfsc, setIsFetchingIfsc] = useState(false);

  useEffect(() => {
    const code = form.ifsc_code.trim().toUpperCase();
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
      setIsFetchingIfsc(true);
      fetch(`https://ifsc.razorpay.com/${code}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.BANK && data.BRANCH) {
            setIfscDetails({ bank: data.BANK, branch: data.BRANCH });
            setForm((prev: any) => ({
              ...prev,
              bank_name: prev.bank_name || data.BANK
            }));
          } else {
            setIfscDetails(null);
          }
        })
        .catch(() => setIfscDetails(null))
        .finally(() => setIsFetchingIfsc(false));
    } else {
      setIfscDetails(null);
    }
  }, [form.ifsc_code]);

  /* Document handling */
  const stageFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        setDocuments(prev => [...prev, {
          id: crypto.randomUUID(),
          document_type: '',
          name: file.name.replace(/\.[^.]+$/, ''),
          file,
          preview: e.target?.result as string,
          mime_type: file.type,
          size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    });
  };
  /* Validation */
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim())  e.last_name  = 'Required';
    if (!form.date_of_joining)   e.date_of_joining = 'Required';
    if (!form.department_id)     e.department_id   = 'Required';
    if (!form.branch_id)         e.branch_id       = 'Required';
    if (!form.position_id)       e.position_id     = 'Required';
    
    if (form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email)) {
      e.personal_email = 'Invalid email format';
    }
    if (form.office_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.office_email)) {
      e.office_email = 'Invalid email format';
    }

    // Identity validation
    const rawAadhaar = form.aadhaar_number.replace(/\s/g, '');
    if (!rawAadhaar) {
      e.aadhaar_number = 'Required';
    } else if (!/^\d{12}$/.test(rawAadhaar)) {
      e.aadhaar_number = 'Aadhaar must be exactly 12 digits';
    }

    if (!form.pan_number.trim()) {
      e.pan_number = 'Required';
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(form.pan_number)) {
      e.pan_number = 'Invalid PAN format (e.g., ABCDE1234F)';
    }

    if (form.passport_number.trim() && !/^[A-Z][0-9]{7}$/i.test(form.passport_number)) {
      e.passport_number = 'Invalid Passport format (e.g., A1234567)';
    }

    if (form.driving_license_number.trim() && !/^[A-Z]{2}[0-9]{13}$/i.test(form.driving_license_number.replace(/[\s-]/g, ''))) {
      e.driving_license_number = 'Invalid DL format (15 chars, e.g., MH0420230000001)';
    }

    if (form.voter_id.trim() && !/^[A-Z]{3}[0-9]{7}$/i.test(form.voter_id)) {
      e.voter_id = 'Invalid Voter ID format (e.g., ABC1234567)';
    }

    // Payroll validation
    if (form.bank_account_number.trim() && !/^\d{9,18}$/.test(form.bank_account_number)) {
      e.bank_account_number = 'Account number must be 9-18 digits';
    }

    if (form.ifsc_code.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(form.ifsc_code)) {
      e.ifsc_code = 'Invalid IFSC format (e.g., SBIN0001234)';
    }

    if (form.uan_number.trim() && !/^\d{12}$/.test(form.uan_number)) {
      e.uan_number = 'UAN must be exactly 12 digits';
    }

    if (enableLogin) {
      if (!loginForm.email.trim())    e.login_email    = 'Required';
      if (!loginForm.password.trim()) e.login_password = 'Required';
      if (loginForm.password !== loginForm.confirm_password)
        e.login_confirm = 'Passwords do not match';
    }
    if (form.date_of_joining) {
      if (form.probation_end_date && new Date(form.probation_end_date) <= new Date(form.date_of_joining)) {
        e.probation_end_date = 'Probation end date must be after the joining date.';
      }
      if ((form as any).end_date && new Date((form as any).end_date) <= new Date(form.date_of_joining)) {
        e.end_date = 'End date must be after the start date.';
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const firstErrTab = e.first_name || e.last_name || e.date_of_birth ? 0
        : e.date_of_joining || e.department_id || e.branch_id || e.position_id || e.probation_end_date || e.end_date ? 1
        : e.personal_email || e.office_email || e.personal_phone || e.alternate_phone ? 2
        : e.aadhaar_number || e.pan_number || e.passport_number || e.driving_license_number || e.voter_id ? 3
        : e.bank_account_number || e.ifsc_code || e.uan_number ? 4
        : e.login_email || e.login_password || e.login_confirm ? 7 : 0;
      setActiveTab(firstErrTab);

      const firstErrorKey = Object.keys(e)[0];
      setTimeout(() => {
        const el = document.getElementById(firstErrorKey) || document.getElementsByName(firstErrorKey)[0];
        if (el) {
          const focusable = el.tagName === 'DIV' ? el.querySelector('button, input, select') as HTMLElement : el;
          if (focusable) {
            focusable.focus();
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
    return Object.keys(e).length === 0;
  };

  /* Submit */
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const orgId = new URLSearchParams(window.location.search).get('org_id');
      const payload: Record<string, any> = {};
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'present_address' || k === 'permanent_address') {
          const addr = v as AddressValue;
          if (Object.values(addr).some(av => av)) payload[k] = addr;
        } else if (k === 'same_as_present') {
          // UI-only, not sent to the API
        } else if (v !== '') {
          payload[k] = v;
        }
      });
      if (orgId) payload.tenant_id = orgId;
      if (enableLogin) {
        payload.enable_login   = true;
        payload.login_email    = loginForm.email.trim();
        payload.login_username = loginForm.username.trim() || loginForm.email.split('@')[0];
        payload.login_password = loginForm.password;
        payload.login_role     = loginForm.role;
      }

      const { data: resp } = await api.post('/employees', payload);
      const employeeId = resp.data.id;

      /* Upload staged documents */
      const docsToUpload = documents.filter(d => d.document_type && d.name);
      if (docsToUpload.length) {
        await Promise.allSettled(
          docsToUpload.map(doc =>
            api.post(`/employees/${employeeId}/documents`, {
              document_type:   doc.document_type,
              name:            doc.name,
              file_data:       doc.preview,
              mime_type:       doc.mime_type,
              file_size_bytes: doc.size,
            })
          )
        );
      }

      router.push(orgId ? `/dashboard/hr/employees?org_id=${orgId}` : '/dashboard/hr/employees');
    } catch (err: any) {
      let msg = err.response?.data?.message || err.response?.data?.error || 'Failed to create employee';
      if (Array.isArray(msg)) msg = msg[0];
      const msgLower = typeof msg === 'string' ? msg.toLowerCase() : '';

      if (msgLower.includes('personal email')) {
        setErrors({ personal_email: msg });
        setActiveTab(2);
      } else if (msgLower.includes('office email')) {
        setErrors({ office_email: msg });
        setActiveTab(2);
      } else if (msgLower.includes('mobile number')) {
        setErrors({ personal_phone: msg });
        setActiveTab(2);
      } else if (msgLower.includes('alternate number')) {
        setErrors({ alternate_phone: msg });
        setActiveTab(2);
      } else if (msgLower.includes('aadhaar number')) {
        setErrors({ aadhaar_number: msg });
        setActiveTab(3);
      } else if (msgLower.includes('pan number')) {
        setErrors({ pan_number: msg });
        setActiveTab(3);
      } else if (msgLower.includes('passport number')) {
        setErrors({ passport_number: msg });
        setActiveTab(3);
      } else if (msgLower.includes('18 years old')) {
        setErrors({ date_of_birth: msg });
        setActiveTab(0);
      } else {
        alert(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Tab renderers ────────────────────────────────────────────────────── */

  const renderPersonal = () => (
    <div className="space-y-0">
      <SectionTitle title="Employee Record" subtitle="Identification and current employment status" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Employee Code" hint="Auto-generated if left blank">
          <Input value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="e.g. EMP0042" />
        </Field>
        <Field label="Employment Status">
          <select value={form.status} onChange={e => set('status', e.target.value)} className={SEL}>
            <option value="active">Active</option>
            <option value="probation">On Probation</option>
            <option value="confirmed">Confirmed</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>

      <Divider />
      <SectionTitle title="Basic Information" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="First Name" required className={errors.first_name ? 'ring-red-500' : ''}>
          <Input
            id="first_name"
            value={form.first_name}
            onChange={e => set('first_name', e.target.value)}
            className={errors.first_name ? 'border-red-400' : ''}
          />
          {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
        </Field>
        <Field label="Middle Name">
          <Input value={form.middle_name} onChange={e => set('middle_name', e.target.value)} />
        </Field>
        <Field label="Last Name" required>
          <Input
            id="last_name"
            value={form.last_name}
            onChange={e => set('last_name', e.target.value)}
            className={errors.last_name ? 'border-red-400' : ''}
          />
          {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
        </Field>
        <Field label="Nickname / Preferred Name">
          <Input value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="How they prefer to be called" />
        </Field>
        <Field label="Date of Birth" className={errors.date_of_birth ? 'ring-red-500' : ''}>
          <Input type="date" id="date_of_birth" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} className={errors.date_of_birth ? 'border-red-400' : ''} />
          {errors.date_of_birth && <p className="text-xs text-red-500 mt-1">{errors.date_of_birth}</p>}
        </Field>
        <Field label="Gender">
          <select value={form.gender} onChange={e => set('gender', e.target.value)} className={SEL}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Marital Status">
          <select value={form.marital_status} onChange={e => set('marital_status', e.target.value)} className={SEL}>
            <option value="">Select</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </Field>
        <Field label="Blood Group">
          <select value={form.blood_group} onChange={e => set('blood_group', e.target.value)} className={SEL}>
            <option value="">Select</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
              <option key={bg} value={bg}>{bg}</option>
            ))}
          </select>
        </Field>
        <Field label="Nationality">
          <Input value={form.nationality} onChange={e => set('nationality', e.target.value)} />
        </Field>
        <Field label="Religion" hint="Optional">
          <Input value={form.religion} onChange={e => set('religion', e.target.value)} />
        </Field>
      </div>
    </div>
  );

  const renderEmployment = () => (
    <div>
      <SectionTitle title="Organizational Assignment" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Branch" required>
          <select
            id="branch_id"
            value={form.branch_id}
            onChange={e => {
              set('branch_id', e.target.value);
              set('department_id', '');
            }}
            className={SEL + (errors.branch_id ? ' border-red-400' : '')}
          >
            <option value="">Select Branch</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {errors.branch_id && <p className="text-xs text-red-500 mt-1">{errors.branch_id}</p>}
        </Field>
        <Field label="Department" required>
          <select
            id="department_id"
            value={form.department_id}
            onChange={e => set('department_id', e.target.value)}
            className={SEL + (errors.department_id ? ' border-red-400' : '')}
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
        </Field>
        <Field label="Position" required>
          <select
            id="position_id"
            value={form.position_id}
            onChange={e => set('position_id', e.target.value)}
            className={SEL + (errors.position_id ? ' border-red-400' : '')}
          >
            <option value="">Select Position</option>
            {positions.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
          </select>
          {errors.position_id && <p className="text-xs text-red-500 mt-1">{errors.position_id}</p>}
        </Field>
        <Field label="Employment Type">
          <select value={form.employment_type_id} onChange={e => set('employment_type_id', e.target.value)} className={SEL}>
            <option value="">Select Type</option>
            {employmentTypes
              .filter((et, i, arr) => arr.findIndex(x => x.name === et.name) === i)
              .map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
          </select>
        </Field>
        <Field label="Reporting Manager">
          <ManagerSelectCombobox
            value={form.reporting_manager_id}
            onChange={v => set('reporting_manager_id', v)}
            branchId={form.branch_id}
            activeOrgKey={selectedTenantId}
          />
        </Field>
      </div>

      <Divider />
      <SectionTitle title="Dates & Lifecycle" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Date of Joining" required>
          <Input
            id="date_of_joining"
            type="date"
            value={form.date_of_joining}
            onChange={e => set('date_of_joining', e.target.value)}
            className={errors.date_of_joining ? 'border-red-400' : ''}
          />
          {errors.date_of_joining && <p className="text-xs text-red-500 mt-1">{errors.date_of_joining}</p>}
        </Field>
        <Field label="Probation End Date">
          <Input
            id="probation_end_date"
            type="date"
            value={form.probation_end_date}
            onChange={e => set('probation_end_date', e.target.value)}
            className={errors.probation_end_date ? 'border-red-400' : ''}
          />
          {errors.probation_end_date && <p className="text-xs text-red-500 mt-1">{errors.probation_end_date}</p>}
        </Field>
      </div>
    </div>
  );

  const renderContact = () => (
    <div>
      <SectionTitle title="Phone & Email" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Mobile Number">
          <PhoneNumberInput value={form.personal_phone} onChange={v => set('personal_phone', v)} />
          {errors.personal_phone && <p className="text-xs text-red-500 mt-1">{errors.personal_phone}</p>}
        </Field>
        <Field label="Alternate Number">
          <PhoneNumberInput value={form.alternate_phone} onChange={v => set('alternate_phone', v)} />
          {errors.alternate_phone && <p className="text-xs text-red-500 mt-1">{errors.alternate_phone}</p>}
        </Field>
        <Field label="Office Telephone">
          <PhoneNumberInput value={form.office_telephone} onChange={v => set('office_telephone', v)} />
        </Field>
        <Field label="Personal Email">
          <Input id="personal_email" type="email" value={form.personal_email} onChange={e => set('personal_email', e.target.value)} className={errors.personal_email ? 'border-red-400' : ''} />
          {errors.personal_email && <p className="text-xs text-red-500 mt-1">{errors.personal_email}</p>}
        </Field>
        <Field label="Office Email">
          <Input id="office_email" type="email" value={form.office_email} onChange={e => set('office_email', e.target.value)} placeholder="name@company.com" className={errors.office_email ? 'border-red-400' : ''} />
          {errors.office_email && <p className="text-xs text-red-500 mt-1">{errors.office_email}</p>}
        </Field>
      </div>

      <Divider />
      <SectionTitle title="Present / Current Address" />
      <div className="mb-6">
        <AddressFields
          value={form.present_address}
          onChange={addr => {
            set('present_address', addr);
            if (form.same_as_present) set('permanent_address', addr);
          }}
        />
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.same_as_present}
          onChange={e => {
            const checked = e.target.checked;
            set('same_as_present', checked);
            if (checked) set('permanent_address', form.present_address);
          }}
          className="w-4 h-4 rounded border-border"
        />
        <span className="text-sm text-foreground">Same as Present Address</span>
      </label>

      <SectionTitle title="Permanent Address" />
      <AddressFields
        value={form.permanent_address}
        onChange={addr => set('permanent_address', addr)}
        disabled={form.same_as_present}
      />
    </div>
  );

  const renderIdentity = () => (
    <div>
      <SectionTitle title="Government ID Numbers" subtitle="Aadhaar and PAN are mandatory for payroll compliance. Stored securely." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Aadhaar Number" required className={errors.aadhaar_number ? 'ring-red-500' : ''}>
          <Input 
            id="aadhaar_number"
            value={form.aadhaar_number} 
            onChange={e => set('aadhaar_number', e.target.value)} 
            placeholder="XXXX XXXX XXXX" 
            maxLength={14} 
            className={errors.aadhaar_number ? 'border-red-400' : ''}
          />
          {errors.aadhaar_number && <p className="text-xs text-red-500 mt-1">{errors.aadhaar_number}</p>}
        </Field>
        <Field label="PAN Number" required className={errors.pan_number ? 'ring-red-500' : ''}>
          <Input 
            id="pan_number"
            value={form.pan_number} 
            onChange={e => set('pan_number', e.target.value.toUpperCase())} 
            placeholder="ABCDE1234F" 
            maxLength={10}
            className={errors.pan_number ? 'border-red-400 uppercase' : 'uppercase'} 
          />
          {errors.pan_number && <p className="text-xs text-red-500 mt-1">{errors.pan_number}</p>}
        </Field>
        <Field label="Passport Number" className={errors.passport_number ? 'ring-red-500' : ''}>
          <Input 
            id="passport_number"
            value={form.passport_number} 
            onChange={e => set('passport_number', e.target.value.toUpperCase())} 
            placeholder="A1234567" 
            className={errors.passport_number ? 'border-red-400' : ''}
          />
          {errors.passport_number && <p className="text-xs text-red-500 mt-1">{errors.passport_number}</p>}
        </Field>
        <Field label="Driving License" className={errors.driving_license_number ? 'ring-red-500' : ''}>
          <Input 
            id="driving_license_number"
            value={form.driving_license_number} 
            onChange={e => set('driving_license_number', e.target.value.toUpperCase())} 
            className={errors.driving_license_number ? 'border-red-400' : ''}
          />
          {errors.driving_license_number && <p className="text-xs text-red-500 mt-1">{errors.driving_license_number}</p>}
        </Field>
        <Field label="Voter ID" className={errors.voter_id ? 'ring-red-500' : ''}>
          <Input 
            id="voter_id"
            value={form.voter_id} 
            onChange={e => set('voter_id', e.target.value.toUpperCase())} 
            className={errors.voter_id ? 'border-red-400' : ''}
          />
          {errors.voter_id && <p className="text-xs text-red-500 mt-1">{errors.voter_id}</p>}
        </Field>
        <Field label="Employee Card Number" hint="Physical ID card / access card">
          <Input value={form.employee_card_number} onChange={e => set('employee_card_number', e.target.value)} />
        </Field>
      </div>
    </div>
  );

  const renderPayroll = () => (
    <div>
      <SectionTitle title="Bank Account" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Bank Name">
          <Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. SBI, HDFC, ICICI" />
        </Field>
        <Field label="Account Number" className={errors.bank_account_number ? 'ring-red-500' : ''}>
          <Input 
            id="bank_account_number"
            value={form.bank_account_number} 
            onChange={e => set('bank_account_number', e.target.value)} 
            placeholder="Bank account number" 
            className={errors.bank_account_number ? 'border-red-400' : ''}
          />
          {errors.bank_account_number && <p className="text-xs text-red-500 mt-1">{errors.bank_account_number}</p>}
        </Field>
        <Field label="IFSC Code" className={errors.ifsc_code ? 'ring-red-500' : ''}>
          <div className="relative">
            <Input 
              id="ifsc_code"
              value={form.ifsc_code} 
              onChange={e => set('ifsc_code', e.target.value.toUpperCase())} 
              placeholder="SBIN0001234" 
              maxLength={11} 
              className={errors.ifsc_code ? 'border-red-400' : ''}
            />
            {isFetchingIfsc && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {errors.ifsc_code && <p className="text-xs text-red-500 mt-1">{errors.ifsc_code}</p>}
          {ifscDetails && !errors.ifsc_code && (
            <p className="text-xs text-emerald-600 font-medium mt-1">
              Branch: {ifscDetails.branch}
            </p>
          )}
        </Field>
        <Field label="Account Type">
          <select value={form.account_type} onChange={e => set('account_type', e.target.value)} className={SEL}>
            <option value="savings">Savings</option>
            <option value="current">Current</option>
            <option value="salary">Salary Account</option>
          </select>
        </Field>
        <Field label="UPI ID">
          <Input value={form.upi_id} onChange={e => set('upi_id', e.target.value)} placeholder="name@upi" />
        </Field>
      </div>

      <Divider />
      <SectionTitle title="Statutory Numbers" subtitle="PF, UAN, ESIC for payroll compliance" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="PF Number">
          <Input value={form.pf_number} onChange={e => set('pf_number', e.target.value)} />
        </Field>
        <Field label="UAN Number" className={errors.uan_number ? 'ring-red-500' : ''}>
          <Input 
            id="uan_number"
            value={form.uan_number} 
            onChange={e => set('uan_number', e.target.value)} 
            placeholder="12-digit UAN" 
            maxLength={12} 
            className={errors.uan_number ? 'border-red-400' : ''}
          />
          {errors.uan_number && <p className="text-xs text-red-500 mt-1">{errors.uan_number}</p>}
        </Field>
        <Field label="ESIC Number">
          <Input value={form.esic_number} onChange={e => set('esic_number', e.target.value)} />
        </Field>
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div>
      <SectionTitle
        title="Biometric Enrollment"
        subtitle="Link this employee to biometric devices (ZKTeco, EasyTimePro, etc.)"
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Field label="Biometric Employee ID" hint="Employee ID registered in the biometric device">
          <Input
            value={form.biometric_employee_id}
            onChange={e => set('biometric_employee_id', e.target.value)}
            placeholder="e.g. 42"
          />
        </Field>
        <Field label="Device Code" hint="Device/terminal identifier for attendance sync">
          <Input
            value={form.device_code}
            onChange={e => set('device_code', e.target.value)}
            placeholder="e.g. DEV001"
          />
        </Field>
        <Field label="Card / Badge Number" hint="RFID card or badge number">
          <Input
            value={form.card_number}
            onChange={e => set('card_number', e.target.value)}
            placeholder="e.g. C-1042"
          />
        </Field>
      </div>

      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-start gap-3">
          <Fingerprint className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Biometric Sync</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              After creating this employee, their biometric ID will be used for attendance sync from connected
              ZKTeco and EasyTimePro devices. Shift assignment and attendance policies can be configured from
              the employee&apos;s profile after creation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div>
      <SectionTitle
        title="Employee Document Vault"
        subtitle="Upload identity proofs, employment records, and HR documents"
      />

      {/* Drop zone */}
      {canUploadDocuments ? (
        <div
          className={[
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer mb-5',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/20',
          ].join(' ')}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); stageFiles(e.dataTransfer.files); }}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Upload className={['w-5 h-5 transition-colors', dragOver ? 'text-primary' : 'text-muted-foreground'].join(' ')} />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            {dragOver ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground">
            Supported: PDF, JPG, PNG, DOCX — up to 10 MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden"
            onChange={e => stageFiles(e.target.files)}
          />
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-xl p-8 text-center mb-5 border-border bg-muted/10 text-muted-foreground">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">You don't have permission to upload documents</p>
        </div>
      )}

      {/* Staged documents */}
      {documents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {documents.length} Document{documents.length !== 1 ? 's' : ''} queued for upload
          </p>
          {documents.map(doc => (
            <FilePreviewCard
              key={doc.id}
              doc={doc}
              onRemove={() => setDocuments(prev => prev.filter(d => d.id !== doc.id))}
              onTypeChange={v => setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, document_type: v } : d))}
              onNameChange={v => setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, name: v } : d))}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No documents added yet</p>
          <p className="text-xs mt-1">Documents can also be added after employee creation</p>
        </div>
      )}

      {/* Quick-add row */}
      {canUploadDocuments && (
        <button
          type="button"
          className="mt-4 flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors"
          onClick={() => {
            setDocuments(prev => [...prev, {
              id: crypto.randomUUID(),
              document_type: '',
              name: '',
              file: null,
              preview: null,
              mime_type: '',
              size: 0,
            }]);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add document entry without file
        </button>
      )}
    </div>
  );

  const renderAccess = () => (
    <div>
      <div className="p-5 border border-border rounded-xl bg-muted/20 mb-6">
        <Toggle
          checked={enableLogin}
          onChange={setEnableLogin}
          label="Enable Application Login for this employee"
        />
        <p className="text-xs text-muted-foreground mt-2 ml-14">
          {enableLogin
            ? 'This employee will receive login credentials and can access the Ai-HRMS portal based on their assigned role.'
            : 'This employee will exist as an HR record only — for payroll, attendance, and biometric tracking — without application access.'}
        </p>
      </div>

      {!enableLogin && (
        <div className="rounded-xl border border-border p-5 bg-background">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">HR Record Only</p>
              <p className="text-sm text-muted-foreground mt-1">
                This employee will be tracked in attendance, payroll, and HR records.
                They will NOT have login credentials. You can enable access later from
                the employee profile page.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {['Payroll & Payslips', 'Attendance Tracking', 'Biometric Sync', 'HR Lifecycle Events', 'Document Storage', 'Leave Management'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {enableLogin && (
        <div className="space-y-5">
          <SectionTitle title="Login Credentials" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Login Email" required>
              <Input
                id="login_email"
                type="email"
                value={loginForm.email}
                onChange={e => setLogin('email', e.target.value)}
                placeholder="employee@company.com"
                className={errors.login_email ? 'border-red-400' : ''}
              />
              {errors.login_email && <p className="text-xs text-red-500 mt-1">{errors.login_email}</p>}
            </Field>
            <Field label="Username" hint="Defaults to email prefix if left blank">
              <Input
                value={loginForm.username}
                onChange={e => setLogin('username', e.target.value)}
                placeholder="john.doe"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Password" required>
              <div className="relative">
                <Input
                  id="login_password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={e => setLogin('password', e.target.value)}
                  placeholder="Minimum 8 characters"
                  className={errors.login_password ? 'border-red-400 pr-10' : 'pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.login_password && <p className="text-xs text-red-500 mt-1">{errors.login_password}</p>}
            </Field>
            <Field label="Confirm Password" required>
              <Input
                id="login_confirm"
                type={showPassword ? 'text' : 'password'}
                value={loginForm.confirm_password}
                onChange={e => setLogin('confirm_password', e.target.value)}
                className={errors.login_confirm ? 'border-red-400' : ''}
              />
              {errors.login_confirm && <p className="text-xs text-red-500 mt-1">{errors.login_confirm}</p>}
            </Field>
          </div>

          <Divider />
          <SectionTitle title="Role & Permissions" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="System Role" hint="Determines module access and permissions">
              <select value={loginForm.role} onChange={e => setLogin('role', e.target.value)} className={SEL}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                The employee will receive these credentials immediately. Ensure the email address
                is correct before submitting. You can change the password or role from the employee
                profile page after creation.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const TAB_RENDERERS = [
    renderPersonal, renderEmployment, renderContact, renderIdentity,
    renderPayroll, renderAttendance, renderDocuments, renderAccess,
  ];

  /* ── Progress indicator ───────────────────────────────────────────────── */
  const completedTabs = (() => {
    const c = new Set<number>();
    if (form.first_name && form.last_name)                   c.add(0);
    if (form.department_id && form.date_of_joining)          c.add(1);
    if (form.personal_phone || form.personal_email)          c.add(2);
    if (form.aadhaar_number || form.pan_number)              c.add(3);
    if (form.bank_name || form.bank_account_number)          c.add(4);
    if (form.biometric_employee_id)                          c.add(5);
    if (documents.length > 0)                                c.add(6);
    return c;
  })();

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top header */}
      <div className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard/hr/employees')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Employee Master
              </button>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-sm font-medium text-foreground">Add Employee</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/dashboard/hr/employees')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving} className="min-w-[140px]">
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating…</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" /> Create Employee</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-6">

          {/* Sidebar tab navigation */}
          <aside className="w-52 shrink-0">
            <div className="sticky top-6 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
                Sections
              </p>
              {TABS.map((tab, i) => {
                const Icon = tab.icon;
                const isActive = i === activeTab;
                const isDone   = completedTabs.has(i);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(i)}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    ].join(' ')}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{tab.label}</span>
                    {isDone && !isActive && (
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    )}
                    {tab.id === 'access' && (
                      <span className={[
                        'text-[9px] font-bold px-1.5 py-0.5 rounded',
                        isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                      ].join(' ')}>
                        OPT
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Form content */}
          <div className="flex-1 min-w-0">
            <div className="bg-background rounded-2xl border border-border shadow-sm">
              {/* Tab header */}
              <div className="px-6 py-5 border-b border-border">
                <div className="flex items-center gap-3">
                  {(() => { const Icon = TABS[activeTab].icon; return <Icon className="w-5 h-5 text-primary" />; })()}
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{TABS[activeTab].label}</h2>
                    <p className="text-xs text-muted-foreground">
                      Step {activeTab + 1} of {TABS.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tab body */}
              <div className="p-6">
                {TAB_RENDERERS[activeTab]()}
              </div>

              {/* Tab footer navigation */}
              <div className="px-6 py-4 border-t border-border bg-muted/10 rounded-b-2xl flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setActiveTab(p => Math.max(0, p - 1))}
                  disabled={activeTab === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {activeTab + 1} / {TABS.length}
                </span>
                {activeTab < TABS.length - 1 ? (
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab(p => Math.min(TABS.length - 1, p + 1))}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={saving} className="min-w-[140px]">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating…</>
                      : <><Check className="w-4 h-4 mr-2" /> Create Employee</>
                    }
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
