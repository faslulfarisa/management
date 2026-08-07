'use client';

import { useState, Suspense, forwardRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Fingerprint,
  Globe,
  MapPin,
  Phone,
  Settings,
  TrendingUp,
  UserSquare2,
  Wallet,
  UsersRound,
  Lock,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';
import { createOpsOrganization } from '@/lib/operations-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ── Constants ────────────────────────────────────────────────────────────────

const COMPANY_TYPES = [
  { value: 'private_limited', label: 'Private Limited' },
  { value: 'public_limited', label: 'Public Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'ngo', label: 'NGO / Non-Profit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const COMPANY_SIZES = [
  { value: '1-50', label: '1–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-500', label: '201–500 employees' },
  { value: '501-1000', label: '501–1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

const FISCAL_MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' },   { value: 4, label: 'April' },
  { value: 5, label: 'May' },     { value: 6, label: 'June' },
  { value: 7, label: 'July' },    { value: 8, label: 'August' },
  { value: 9, label: 'September' },{ value: 10, label: 'October' },
  { value: 11, label: 'November' },{ value: 12, label: 'December' },
];

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MMM DD, YYYY'];

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' }, { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

type DayKey = typeof DAYS[number]['key'];

const REQUIREMENTS: { key: string; icon: React.ElementType; title: string; desc: string }[] = [
  { key: 'attendanceRequirement', icon: Calendar,   title: 'Attendance Management', desc: 'Check-ins, shifts, and leave tracking.' },
  { key: 'payrollRequirement',    icon: Wallet,      title: 'Payroll Management',    desc: 'Payroll runs, payslips, compliance.' },
  { key: 'recruitmentRequirement',icon: UsersRound,  title: 'Recruitment Module',    desc: 'Source, screen, and hire candidates.' },
  { key: 'performanceRequirement',icon: TrendingUp,  title: 'Performance Management',desc: 'Goals, reviews, feedback cycles.' },
  { key: 'biometricRequirement',  icon: Fingerprint, title: 'Biometric Integration', desc: 'Connect biometric attendance devices.' },
];

// ── Schema ───────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  line1:       z.string().min(1, 'Required'),
  line2:       z.string().optional(),
  city:        z.string().min(1, 'Required'),
  state:       z.string().min(1, 'Required'),
  country:     z.string().min(1, 'Required'),
  postal_code: z.string().min(1, 'Required'),
});

const schema = z.object({
  // Identity
  legalName:          z.string().min(1, 'Legal name is required'),
  tradeName:          z.string().optional(),
  companyCode:        z.string().optional(),
  companyType:        z.string().min(1, 'Company type is required'),
  registrationNumber: z.string().optional(),
  gstin:              z.string().optional(),
  panNumber:          z.string().optional(),
  cinNumber:          z.string().optional(),
  industry:           z.string().optional(),
  companySize:        z.string().optional(),
  estimatedEmployeeCount: z.union([z.coerce.number().int().min(1), z.literal('')]).optional(),
  estimatedBranchCount:   z.union([z.coerce.number().int().min(1), z.literal('')]).optional(),
  // Contact
  corporateEmail:     z.string().min(1, 'Required').email('Invalid email'),
  supportEmail:       z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  phoneNumber:        z.string().min(1, 'Required'),
  alternatePhone:     z.string().optional(),
  websiteUrl:         z.string().optional(),
  contactPersonName:  z.string().min(1, 'Required'),
  contactRole:        z.string().min(1, 'Required'),
  contactPersonMobile:z.string().min(1, 'Required'),
  contactPersonEmail: z.string().min(1, 'Required').email('Invalid email'),
  // Operations
  fiscalYearStart:    z.coerce.number().int().min(1).max(12),
  timezone:           z.string().min(1, 'Required'),
  currency:           z.string().min(1, 'Required'),
  dateFormat:         z.string().min(1, 'Required'),
  businessCategory:   z.string().optional(),
  currentHrSystem:    z.string().optional(),
  payrollRequirement:     z.boolean().optional(),
  attendanceRequirement:  z.boolean().optional(),
  recruitmentRequirement: z.boolean().optional(),
  performanceRequirement: z.boolean().optional(),
  biometricRequirement:   z.boolean().optional(),
  // Addresses
  registeredAddress:  addressSchema,
  sameAsRegistered:   z.boolean().optional(),
  operationalAddress: addressSchema.partial().optional(),
  // Admin
  isExistingUser: z.boolean().default(false),
  adminFullName: z.string().optional(),
  adminEmail:    z.string().min(1, 'Required').email('Invalid email'),
  adminPassword: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.isExistingUser) {
    if (!data.adminFullName || data.adminFullName.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Required', path: ['adminFullName'] });
    }
    if (!data.adminPassword || data.adminPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.adminPassword)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Min 8 chars, needs uppercase, lowercase & number', path: ['adminPassword'] });
    }
  }
});

type FormData = z.infer<typeof schema>;

const STEPS = [
  { label: 'Identity',    icon: Building2,   desc: 'Legal details & classification' },
  { label: 'Contact',     icon: Phone,        desc: 'Emails, phones & primary contact' },
  { label: 'Operations',  icon: Settings,     desc: 'Locale, fiscal & module settings' },
  { label: 'Addresses',   icon: MapPin,       desc: 'Registered & operational addresses' },
  { label: 'Admin',       icon: UserSquare2,  desc: 'Initial admin account credentials' },
  { label: 'Review',      icon: Check,        desc: 'Confirm all details before submit' },
];

const STEP_FIELDS: (keyof FormData)[][] = [
  ['legalName', 'companyType'],
  ['corporateEmail', 'phoneNumber', 'contactPersonName', 'contactRole', 'contactPersonMobile', 'contactPersonEmail'],
  ['timezone', 'currency', 'dateFormat', 'fiscalYearStart'],
  ['registeredAddress'],
  ['adminEmail', 'adminFullName', 'adminPassword'],
  [],
];

// ── Component ────────────────────────────────────────────────────────────────

function CreateOrgPageInner() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [workWeek, setWorkWeek] = useState<Record<DayKey, boolean>>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  });

  const { register, handleSubmit, trigger, watch, setValue, getValues, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        companyType: '', companySize: '',
        fiscalYearStart: 4, timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD/MM/YYYY',
        sameAsRegistered: true,
        payrollRequirement: false, attendanceRequirement: false,
        recruitmentRequirement: false, performanceRequirement: false, biometricRequirement: false,
        registeredAddress: { line1: '', line2: '', city: '', state: '', country: '', postal_code: '' },
        isExistingUser: false,
      },
    });

  const sameAsRegistered = watch('sameAsRegistered');
  const isExistingUser = watch('isExistingUser');

  const toggleDay = (key: DayKey) => setWorkWeek((w) => ({ ...w, [key]: !w[key] }));

  const copyRegistered = () => setValue('operationalAddress', { ...getValues('registeredAddress') });

  const next = async () => {
    const valid = await trigger(STEP_FIELDS[step] as any);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: data.tradeName || data.legalName,
        slug: data.legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50),
        legal_name: data.legalName,
        trade_name: data.tradeName || undefined,
        company_type: data.companyType,
        registration_number: data.registrationNumber || undefined,
        gstin: data.gstin || undefined,
        pan_number: data.panNumber || undefined,
        cin_number: data.cinNumber || undefined,
        industry: data.industry || undefined,
        website_url: data.websiteUrl || undefined,
        primary_email: data.corporateEmail,
        support_email: data.supportEmail || undefined,
        phone_number: data.phoneNumber,
        alternate_phone: data.alternatePhone || undefined,
        registered_address: data.registeredAddress,
        operational_address: data.sameAsRegistered ? undefined : data.operationalAddress,
        estimated_branch_count: data.estimatedBranchCount ? Number(data.estimatedBranchCount) : undefined,
        estimated_employee_count: data.estimatedEmployeeCount ? Number(data.estimatedEmployeeCount) : undefined,
        business_category: data.businessCategory || undefined,
        current_hr_system: data.currentHrSystem || undefined,
        company_size: data.companySize || undefined,
        payroll_requirement: !!data.payrollRequirement,
        attendance_requirement: !!data.attendanceRequirement,
        recruitment_requirement: !!data.recruitmentRequirement,
        performance_requirement: !!data.performanceRequirement,
        biometric_requirement: !!data.biometricRequirement,
        contact_person_name: data.contactPersonName,
        contact_designation: data.contactRole,
        contact_person_mobile: data.contactPersonMobile,
        contact_person_email: data.contactPersonEmail,
        fiscal_year_start: data.fiscalYearStart,
        timezone: data.timezone,
        currency: data.currency,
        date_format: data.dateFormat,
        lifecycleStage: 'pending_review',
        // Admin fields (used by backend to provision admin account)
        adminFullName: data.isExistingUser ? undefined : data.adminFullName,
        adminEmail: data.adminEmail,
        adminPassword: data.isExistingUser ? undefined : data.adminPassword,
      };

      const result = await createOpsOrganization(payload);
      router.push(`/operations/organizations/new/success?tenantId=${result.id}&name=${encodeURIComponent(data.legalName)}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Organization creation failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Organizations
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">New Organization</h1>
        <p className="text-muted-foreground">Create a new customer organization in the platform pipeline.</p>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 transition-all duration-500 rounded-full"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Left: step context card */}
          <div className="xl:col-span-1">
            <div className="ops-panel p-5 sticky top-20">
              <div className="flex items-center gap-2.5 mb-4">
                {(() => { const Icon = STEPS[step].icon; return <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-50 text-violet-600"><Icon className="w-4 h-4" /></div>; })()}
                <div>
                  <p className="text-sm font-semibold text-slate-800">Step {step + 1} of {STEPS.length}</p>
                  <p className="text-xs text-slate-400">{STEPS[step].label}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-5">{STEPS[step].desc}</p>
              <div className="space-y-2">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div key={s.label} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-all ${active ? 'bg-violet-50 text-violet-700 font-medium' : done ? 'text-slate-500' : 'text-slate-400'}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-violet-600 text-white' : done ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'}`}>
                        {done ? <Check className="w-2.5 h-2.5" /> : <Icon className="w-2.5 h-2.5" />}
                      </div>
                      {s.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: form fields */}
          <div className="xl:col-span-3 space-y-4">

            {/* ── Step 0: Identity ─────────────────────────────────────────── */}
            {step === 0 && (
              <>
                <Panel title="Business Identity">
                  <Grid2>
                    <Field label="Legal Company Name *" error={errors.legalName?.message} className="col-span-2 sm:col-span-1">
                      <Input {...register('legalName')} placeholder="Acme Corporation Pvt Ltd" />
                    </Field>
                    <Field label="Trade / Display Name" className="col-span-2 sm:col-span-1">
                      <Input {...register('tradeName')} placeholder="Acme (defaults to legal name)" />
                    </Field>
                    <Field label="Company Code">
                      <Input {...register('companyCode')} placeholder="ACME001" />
                    </Field>
                    <Field label="Company Type *" error={errors.companyType?.message}>
                      <Select {...register('companyType')}>
                        <option value="">— Select type —</option>
                        {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Industry">
                      <Input {...register('industry')} placeholder="e.g. Information Technology" />
                    </Field>
                    <Field label="Company Size">
                      <Select {...register('companySize')}>
                        <option value="">— Select size —</option>
                        {COMPANY_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Estimated Employees">
                      <Input type="number" min={1} {...register('estimatedEmployeeCount')} placeholder="e.g. 120" />
                    </Field>
                    <Field label="Number of Branches">
                      <Input type="number" min={1} {...register('estimatedBranchCount')} placeholder="e.g. 3" />
                    </Field>
                  </Grid2>
                </Panel>

                <Panel title="Registration & Tax Numbers" subtitle="Optional — add available compliance identifiers">
                  <Grid2>
                    <Field label="Registration Number">
                      <Input {...register('registrationNumber')} placeholder="U12345MH2020PTC123456" />
                    </Field>
                    <Field label="GST / VAT Number">
                      <Input {...register('gstin')} placeholder="27AABCU9603R1ZX" />
                    </Field>
                    <Field label="PAN / TIN Number">
                      <Input {...register('panNumber')} placeholder="AABCU9603R" />
                    </Field>
                    <Field label="CIN / Business License">
                      <Input {...register('cinNumber')} placeholder="U12345MH2020PTC123456" />
                    </Field>
                  </Grid2>
                </Panel>
              </>
            )}

            {/* ── Step 1: Contact ──────────────────────────────────────────── */}
            {step === 1 && (
              <>
                <Panel title="Email Addresses">
                  <Grid2>
                    <Field label="Business Email *" error={errors.corporateEmail?.message}>
                      <InputIcon icon={<Mail className="h-4 w-4" />}>
                        <Input type="email" {...register('corporateEmail')} placeholder="hello@company.com" className="pl-9" />
                      </InputIcon>
                    </Field>
                    <Field label="Support Email">
                      <InputIcon icon={<Mail className="h-4 w-4" />}>
                        <Input type="email" {...register('supportEmail')} placeholder="support@company.com" className="pl-9" />
                      </InputIcon>
                    </Field>
                  </Grid2>
                </Panel>

                <Panel title="Phone & Web">
                  <Grid2>
                    <Field label="Primary Phone *" error={errors.phoneNumber?.message}>
                      <InputIcon icon={<Phone className="h-4 w-4" />}>
                        <Input type="tel" {...register('phoneNumber')} placeholder="+91 98765 43210" className="pl-9" />
                      </InputIcon>
                    </Field>
                    <Field label="Alternate Phone">
                      <InputIcon icon={<Phone className="h-4 w-4" />}>
                        <Input type="tel" {...register('alternatePhone')} placeholder="+91 98765 43211" className="pl-9" />
                      </InputIcon>
                    </Field>
                    <Field label="Website URL" className="col-span-2">
                      <InputIcon icon={<Globe className="h-4 w-4" />}>
                        <Input type="url" {...register('websiteUrl')} placeholder="https://www.company.com" className="pl-9" />
                      </InputIcon>
                    </Field>
                  </Grid2>
                </Panel>

                <Panel title="Primary Contact Person">
                  <Grid2>
                    <Field label="Contact Person Name *" error={errors.contactPersonName?.message}>
                      <Input {...register('contactPersonName')} placeholder="Jane Doe" />
                    </Field>
                    <Field label="Role *" error={errors.contactRole?.message}>
                      <Input {...register('contactRole')} placeholder="HR Manager" />
                    </Field>
                    <Field label="Mobile *" error={errors.contactPersonMobile?.message}>
                      <InputIcon icon={<Phone className="h-4 w-4" />}>
                        <Input type="tel" {...register('contactPersonMobile')} placeholder="+91 98765 43210" className="pl-9" />
                      </InputIcon>
                    </Field>
                    <Field label="Email *" error={errors.contactPersonEmail?.message}>
                      <InputIcon icon={<Mail className="h-4 w-4" />}>
                        <Input type="email" {...register('contactPersonEmail')} placeholder="contact@company.com" className="pl-9" />
                      </InputIcon>
                    </Field>
                  </Grid2>
                </Panel>
              </>
            )}

            {/* ── Step 2: Operations ───────────────────────────────────────── */}
            {step === 2 && (
              <>
                <Panel title="Locale & Formatting">
                  <Grid2>
                    <Field label="Timezone *" error={errors.timezone?.message} className="col-span-2">
                      <Input {...register('timezone')} placeholder="Asia/Kolkata" />
                      <p className="text-xs text-muted-foreground mt-1">IANA timezone, e.g. Asia/Kolkata, America/New_York</p>
                    </Field>
                    <Field label="Default Currency *" error={errors.currency?.message}>
                      <Input {...register('currency')} placeholder="INR" maxLength={3} />
                    </Field>
                    <Field label="Date Format *" error={errors.dateFormat?.message}>
                      <Select {...register('dateFormat')}>
                        {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </Select>
                    </Field>
                  </Grid2>
                </Panel>

                <Panel title="Fiscal Year">
                  <div className="max-w-xs">
                    <Field label="Fiscal Year Starts In">
                      <Select {...register('fiscalYearStart')}>
                        {FISCAL_MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                </Panel>

                <Panel title="Work Week" subtitle="Select the working days for this organisation">
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                          workWeek[key]
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Module Requirements" subtitle="Select the HRMS modules this organisation needs">
                  <div className="space-y-2">
                    {REQUIREMENTS.map((r) => {
                      const Icon = r.icon;
                      return (
                        <label key={r.key} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 cursor-pointer hover:bg-slate-100/50 transition-colors">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700">{r.title}</div>
                            <div className="text-xs text-slate-400">{r.desc}</div>
                          </div>
                          <input
                            type="checkbox"
                            {...register(r.key as any)}
                            className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <Grid2 className="mt-3">
                    <Field label="Business Category">
                      <Input {...register('businessCategory')} placeholder="e.g. Manufacturing, IT Services" />
                    </Field>
                    <Field label="Current HR System">
                      <Input {...register('currentHrSystem')} placeholder="Spreadsheets, none, etc." />
                    </Field>
                  </Grid2>
                </Panel>
              </>
            )}

            {/* ── Step 3: Addresses ────────────────────────────────────────── */}
            {step === 3 && (
              <>
                <Panel title="Registered Address" subtitle="Legal registration address as per government records">
                  <Field label="Address Line 1 *" error={errors.registeredAddress?.line1?.message}>
                    <Input {...register('registeredAddress.line1')} placeholder="Building / Street" />
                  </Field>
                  <Field label="Address Line 2">
                    <Input {...register('registeredAddress.line2')} placeholder="Area / Locality (optional)" />
                  </Field>
                  <Grid2>
                    <Field label="City *" error={errors.registeredAddress?.city?.message}>
                      <Input {...register('registeredAddress.city')} placeholder="Mumbai" />
                    </Field>
                    <Field label="State / Province *" error={errors.registeredAddress?.state?.message}>
                      <Input {...register('registeredAddress.state')} placeholder="Maharashtra" />
                    </Field>
                    <Field label="Country *" error={errors.registeredAddress?.country?.message}>
                      <Input {...register('registeredAddress.country')} placeholder="India" />
                    </Field>
                    <Field label="Postal Code *" error={errors.registeredAddress?.postal_code?.message}>
                      <Input {...register('registeredAddress.postal_code')} placeholder="400001" />
                    </Field>
                  </Grid2>
                </Panel>

                <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('sameAsRegistered')}
                    className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                  />
                  Operational address is the same as the registered address
                </label>

                {!sameAsRegistered && (
                  <Panel title="Operational Address" subtitle="Day-to-day business address">
                    <div className="flex justify-end mb-2">
                      <Button type="button" variant="outline" size="sm" onClick={copyRegistered} className="gap-1.5 h-7 text-xs">
                        <Copy className="h-3 w-3" /> Copy from registered
                      </Button>
                    </div>
                    <Field label="Address Line 1" error={errors.operationalAddress?.line1?.message}>
                      <Input {...register('operationalAddress.line1')} placeholder="Building / Street" />
                    </Field>
                    <Field label="Address Line 2">
                      <Input {...register('operationalAddress.line2')} placeholder="Area / Locality (optional)" />
                    </Field>
                    <Grid2>
                      <Field label="City"><Input {...register('operationalAddress.city')} placeholder="Mumbai" /></Field>
                      <Field label="State"><Input {...register('operationalAddress.state')} placeholder="Maharashtra" /></Field>
                      <Field label="Country"><Input {...register('operationalAddress.country')} placeholder="India" /></Field>
                      <Field label="Postal Code"><Input {...register('operationalAddress.postal_code')} placeholder="400001" /></Field>
                    </Grid2>
                  </Panel>
                )}
              </>
            )}

            {/* ── Step 4: Admin Account ─────────────────────────────────────── */}
            {step === 4 && (
              <>

                <Panel title="Organization Admin Account" subtitle="This account will be the initial workspace owner">
                  <div className="flex gap-4 mb-4">
                    <label className={`flex-1 flex items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${!isExistingUser ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-border bg-white text-slate-500 hover:bg-slate-50'}`}>
                      <input type="radio" className="hidden" checked={!isExistingUser} onChange={() => setValue('isExistingUser', false)} />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${!isExistingUser ? 'border-violet-600' : 'border-slate-300'}`}>
                        {!isExistingUser && <div className="w-2 h-2 rounded-full bg-violet-600" />}
                      </div>
                      <span className="text-sm font-medium">Create New Account</span>
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors ${isExistingUser ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-border bg-white text-slate-500 hover:bg-slate-50'}`}>
                      <input type="radio" className="hidden" checked={isExistingUser} onChange={() => { setValue('isExistingUser', true); trigger(['adminFullName', 'adminPassword']); }} />
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isExistingUser ? 'border-violet-600' : 'border-slate-300'}`}>
                        {isExistingUser && <div className="w-2 h-2 rounded-full bg-violet-600" />}
                      </div>
                      <span className="text-sm font-medium">Assign Existing User</span>
                    </label>
                  </div>
                  
                  {!isExistingUser && (
                    <Field label="Full Name *" error={errors.adminFullName?.message}>
                      <Input {...register('adminFullName')} placeholder="Jane Smith" />
                    </Field>
                  )}
                  <Field label="Email Address *" error={errors.adminEmail?.message}>
                    <InputIcon icon={<Mail className="h-4 w-4" />}>
                      <Input type="email" {...register('adminEmail')} placeholder="admin@company.com" className="pl-9" />
                    </InputIcon>
                    {isExistingUser && <p className="text-xs text-muted-foreground mt-1">We will look up this user by email and grant them Admin access to this organization.</p>}
                  </Field>
                  {!isExistingUser && (
                    <Field label="Password *" error={errors.adminPassword?.message}>
                      <div className="relative">
                        <InputIcon icon={<Lock className="h-4 w-4" />}>
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            {...register('adminPassword')}
                            placeholder="••••••••"
                            className="pl-9 pr-10"
                          />
                        </InputIcon>
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Min 8 chars · uppercase, lowercase & number required</p>
                    </Field>
                  )}
                </Panel>
              </>
            )}

            {/* ── Step 5: Review ───────────────────────────────────────────── */}
            {step === 5 && (
              <div className="space-y-4">
                <ReviewPanel title="Business Identity">
                  <Row label="Legal Name"        value={watch('legalName')} />
                  <Row label="Trade Name"         value={watch('tradeName')} />
                  <Row label="Company Code"       value={watch('companyCode')} />
                  <Row label="Company Type"       value={COMPANY_TYPES.find((t) => t.value === watch('companyType'))?.label} />
                  <Row label="Industry"           value={watch('industry')} />
                  <Row label="Company Size"       value={COMPANY_SIZES.find((s) => s.value === watch('companySize'))?.label} />
                  <Row label="Employees"          value={watch('estimatedEmployeeCount')?.toString()} />
                  <Row label="Branches"           value={watch('estimatedBranchCount')?.toString()} />
                  <Row label="Registration No."   value={watch('registrationNumber')} />
                  <Row label="GST / VAT"          value={watch('gstin')} />
                  <Row label="PAN / TIN"          value={watch('panNumber')} />
                  <Row label="CIN"                value={watch('cinNumber')} />
                </ReviewPanel>
                <ReviewPanel title="Contact">
                  <Row label="Business Email"   value={watch('corporateEmail')} />
                  <Row label="Support Email"    value={watch('supportEmail')} />
                  <Row label="Phone"            value={watch('phoneNumber')} />
                  <Row label="Website"          value={watch('websiteUrl')} />
                  <Row label="Contact Person"   value={watch('contactPersonName')} />
                  <Row label="Role"             value={watch('contactRole')} />
                  <Row label="Contact Mobile"   value={watch('contactPersonMobile')} />
                  <Row label="Contact Email"    value={watch('contactPersonEmail')} />
                </ReviewPanel>
                <ReviewPanel title="Operations">
                  <Row label="Timezone"     value={watch('timezone')} />
                  <Row label="Currency"     value={watch('currency')} />
                  <Row label="Date Format"  value={watch('dateFormat')} />
                  <Row label="Fiscal Year"  value={FISCAL_MONTHS.find((m) => m.value === Number(watch('fiscalYearStart')))?.label} />
                  <Row label="Work Week"    value={DAYS.filter(({ key }) => workWeek[key]).map(({ label }) => label).join(', ')} />
                  <Row label="Modules"      value={REQUIREMENTS.filter((r) => !!watch(r.key as any)).map((r) => r.title).join(', ') || 'None'} />
                </ReviewPanel>
                <ReviewPanel title="Address">
                  <Row label="Registered" value={[watch('registeredAddress.line1'), watch('registeredAddress.city'), watch('registeredAddress.state'), watch('registeredAddress.country')].filter(Boolean).join(', ')} />
                  <Row label="Operational" value={watch('sameAsRegistered') ? 'Same as registered' : [watch('operationalAddress.line1'), watch('operationalAddress.city'), watch('operationalAddress.country')].filter(Boolean).join(', ')} />
                </ReviewPanel>
                <ReviewPanel title="Admin Account">
                  <Row label="Account Type" value={watch('isExistingUser') ? 'Existing User' : 'New User'} />
                  {!watch('isExistingUser') && <Row label="Name"  value={watch('adminFullName')} />}
                  <Row label="Email" value={watch('adminEmail')} />
                </ReviewPanel>
              </div>
            )}

            {/* Navigation footer */}
            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="outline" onClick={back} disabled={step === 0} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={next} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={submitting} className="gap-2 bg-violet-600 hover:bg-violet-700 min-w-[160px]">
                  {submitting ? (
                    <><span className="animate-spin h-4 w-4 rounded-full border-2 border-white border-t-transparent inline-block" />Creating…</>
                  ) : (
                    <><Check className="h-4 w-4" />Create Organization</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreateOrgPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" /></div>}>
      <CreateOrgPageInner />
    </Suspense>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ops-panel overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Grid2({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-4 ${className ?? ''}`}>{children}</div>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }>(
  ({ children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        {...props}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

function InputIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</div>
      {children}
    </div>
  );
}

function ReviewPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ops-panel overflow-hidden">
      <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-right font-medium text-slate-700 break-all">{value}</span>
    </div>
  );
}
