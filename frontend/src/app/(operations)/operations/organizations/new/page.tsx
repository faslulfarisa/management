'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense, forwardRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FieldErrors, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  MapPin,
  Phone,
  Settings,
  UserSquare2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  Search,
  UserCheck,
} from 'lucide-react';
import { createOpsOrganization, searchOpsClientUsers, type OpsClientUserCandidate } from '@/lib/operations-api';
import { organizationChangeRequestApi, type OrganizationChangeRequest } from '@/lib/organization-registration-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddressFields, { type AddressValue } from '@/components/forms/AddressFields';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';

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

const COMPANY_TYPE_ALIASES: Record<string, string> = {
  private_limited: 'private_limited',
  'private limited': 'private_limited',
  public_limited: 'public_limited',
  'public limited': 'public_limited',
  llp: 'llp',
  partnership: 'partnership',
  sole_proprietorship: 'sole_proprietorship',
  'sole proprietorship': 'sole_proprietorship',
  ngo: 'ngo',
  'ngo / non-profit': 'ngo',
  government: 'government',
  other: 'other',
};

const FISCAL_MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' },   { value: 4, label: 'April' },
  { value: 5, label: 'May' },     { value: 6, label: 'June' },
  { value: 7, label: 'July' },    { value: 8, label: 'August' },
  { value: 9, label: 'September' },{ value: 10, label: 'October' },
  { value: 11, label: 'November' },{ value: 12, label: 'December' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (India)', currency: 'INR' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (United Arab Emirates)', currency: 'AED' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (Singapore)', currency: 'SGD' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (Japan)', currency: 'JPY' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (Hong Kong)', currency: 'HKD' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (Thailand)', currency: 'THB' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (Malaysia)', currency: 'MYR' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (Indonesia)', currency: 'IDR' },
  { value: 'Asia/Manila', label: 'Asia/Manila (Philippines)', currency: 'PHP' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (Saudi Arabia)', currency: 'SAR' },
  { value: 'Europe/London', label: 'Europe/London (United Kingdom)', currency: 'GBP' },
  { value: 'Europe/Paris', label: 'Europe/Paris (France)', currency: 'EUR' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (Germany)', currency: 'EUR' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (Netherlands)', currency: 'EUR' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (Spain)', currency: 'EUR' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)', currency: 'USD' },
  { value: 'America/Chicago', label: 'America/Chicago (US Central)', currency: 'USD' },
  { value: 'America/Denver', label: 'America/Denver (US Mountain)', currency: 'USD' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (US Pacific)', currency: 'USD' },
  { value: 'America/Toronto', label: 'America/Toronto (Canada Eastern)', currency: 'CAD' },
  { value: 'America/Vancouver', label: 'America/Vancouver (Canada Pacific)', currency: 'CAD' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (Brazil)', currency: 'BRL' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (Australia Eastern)', currency: 'AUD' },
  { value: 'Australia/Perth', label: 'Australia/Perth (Australia Western)', currency: 'AUD' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (New Zealand)', currency: 'NZD' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (South Africa)', currency: 'ZAR' },
];

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'THB', label: 'THB - Thai Baht' },
  { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
  { value: 'IDR', label: 'IDR - Indonesian Rupiah' },
  { value: 'PHP', label: 'PHP - Philippine Peso' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'BRL', label: 'BRL - Brazilian Real' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
];

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' }, { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

type DayKey = typeof DAYS[number]['key'];

// ── Schema ───────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  line1:       z.string().min(1, 'Required'),
  line2:       z.string().optional(),
  city:        z.string().min(1, 'Required'),
  state:       z.string().min(1, 'Required'),
  stateCode:   z.string().optional(),
  country:     z.string().min(1, 'Required'),
  countryCode: z.string().optional(),
  postal_code: z.string().min(1, 'Required'),
});

const schema = z.object({
  // Identity
  legalName:          z.string().min(1, 'Legal name is required'),
  tradeName:          z.string().optional(),
  companyCode:        z.string().trim().min(1, 'Company code is required'),
  companyType:        z.string().min(1, 'Company type is required'),
  registrationNumber: z.string().optional(),
  gstin:              z.string().optional(),
  panNumber:          z.string().optional(),
  cinNumber:          z.string().optional(),
  industry:           z.string().optional(),
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
  businessCategory:   z.string().optional(),
  currentHrSystem:    z.string().optional(),
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
  ['legalName', 'companyCode', 'companyType'],
  ['corporateEmail', 'phoneNumber', 'contactPersonName', 'contactRole', 'contactPersonMobile', 'contactPersonEmail'],
  ['timezone', 'currency', 'fiscalYearStart'],
  ['registeredAddress'],
  ['adminEmail', 'adminFullName', 'adminPassword'],
  [],
];

// ── Component ────────────────────────────────────────────────────────────────

function CreateOrgPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceRequestId = searchParams.get('sourceRequestId');
  const formTopRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sourceRequest, setSourceRequest] = useState<OrganizationChangeRequest | null>(null);
  const [sourceRequestLoading, setSourceRequestLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [clientUserSearch, setClientUserSearch] = useState('');
  const [clientUsers, setClientUsers] = useState<OpsClientUserCandidate[]>([]);
  const [clientUsersLoading, setClientUsersLoading] = useState(false);
  const [clientUsersError, setClientUsersError] = useState('');
  const [workWeek, setWorkWeek] = useState<Record<DayKey, boolean>>({
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false,
  });

  const { register, handleSubmit, trigger, watch, setValue, getValues, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        companyCode: '', companyType: '',
        fiscalYearStart: 4, timezone: 'Asia/Kolkata', currency: 'INR',
        sameAsRegistered: true,
        registeredAddress: { line1: '', line2: '', city: '', state: '', country: '', postal_code: '' },
        isExistingUser: false,
      },
    });

  const sameAsRegistered = watch('sameAsRegistered');
  const isExistingUser = watch('isExistingUser');
  const registeredAddress = watch('registeredAddress') as AddressValue;
  const operationalAddress = watch('operationalAddress') as AddressValue;

  const toggleDay = (key: DayKey) => setWorkWeek((w) => ({ ...w, [key]: !w[key] }));

  const handleTimezoneChange = (timezone: string) => {
    const currency = TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.currency;
    setValue('timezone', timezone, { shouldDirty: true, shouldValidate: true });
    if (currency) {
      setValue('currency', currency, { shouldDirty: true, shouldValidate: true });
    }
  };

  const copyRegistered = () => setValue('operationalAddress', { ...getValues('registeredAddress') });
  const setAddress = (key: 'registeredAddress' | 'operationalAddress', address: AddressValue) => {
    setValue(key, address as any, { shouldDirty: true, shouldValidate: true });
  };

  useEffect(() => {
    if (!sourceRequestId) return;
    let mounted = true;
    setSourceRequestLoading(true);
    setError('');
    organizationChangeRequestApi.getOne(sourceRequestId)
      .then((request) => {
        if (!mounted) return;
        const details = request.changes.additionalOrganization?.new ?? {};
        if (!details.organizationName) {
          setError('This source request is not an additional organization request.');
          return;
        }

        const organizationName = String(details.organizationName || '');
        setSourceRequest(request);
        setValue('legalName', organizationName, { shouldDirty: true, shouldValidate: true });
        setValue('tradeName', organizationName, { shouldDirty: true });
        setValue('companyCode', deriveCompanyCode(organizationName), { shouldDirty: true, shouldValidate: true });
        setValue('companyType', normalizeCompanyType(details.companyType), { shouldDirty: true, shouldValidate: true });
        setValue('registrationNumber', details.registrationNumber || '', { shouldDirty: true });
        setValue('gstin', details.gstin || '', { shouldDirty: true });
        setValue('panNumber', details.panNumber || '', { shouldDirty: true });
        setValue('corporateEmail', emailOrBlank(request.requested_by_email) || emailOrBlank(details.contactEmail) || '', { shouldDirty: true, shouldValidate: true });
        setValue('phoneNumber', details.phoneNumber || '', { shouldDirty: true, shouldValidate: true });
        setValue('estimatedBranchCount', details.estimatedBranchCount ?? '', { shouldDirty: true });
        setValue('estimatedEmployeeCount', details.estimatedEmployeeCount ?? '', { shouldDirty: true });
        setValue('contactPersonName', details.contactName || request.requested_by_name || '', { shouldDirty: true, shouldValidate: true });
        setValue('contactRole', 'Owner', { shouldDirty: true, shouldValidate: true });
        setValue('contactPersonMobile', details.contactPhone || '', { shouldDirty: true, shouldValidate: true });
        setValue('contactPersonEmail', emailOrBlank(details.contactEmail) || emailOrBlank(request.requested_by_email) || '', { shouldDirty: true, shouldValidate: true });
        setValue('isExistingUser', true, { shouldDirty: true, shouldValidate: true });
        setValue('adminEmail', emailOrBlank(request.requested_by_email) || emailOrBlank(details.contactEmail) || '', { shouldDirty: true, shouldValidate: true });
        setClientUserSearch(emailOrBlank(request.requested_by_email) || emailOrBlank(details.contactEmail) || '');
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Failed to load source organization request.');
      })
      .finally(() => {
        if (mounted) setSourceRequestLoading(false);
      });

    return () => { mounted = false; };
  }, [sourceRequestId, setValue]);

  useEffect(() => {
    if (!isExistingUser) return;

    let mounted = true;
    const timer = window.setTimeout(() => {
      setClientUsersLoading(true);
      setClientUsersError('');
      searchOpsClientUsers(clientUserSearch)
        .then((users) => {
          if (mounted) setClientUsers(users);
        })
        .catch(() => {
          if (!mounted) return;
          setClientUsers([]);
          setClientUsersError('Unable to load client-side users.');
        })
        .finally(() => {
          if (mounted) setClientUsersLoading(false);
        });
    }, 250);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [isExistingUser, clientUserSearch]);

  const selectExistingUser = (user: OpsClientUserCandidate) => {
    setClientUserSearch(user.email);
    setValue('adminEmail', user.email, { shouldDirty: true, shouldValidate: true });
  };

  const scrollToFormTop = () => {
    window.requestAnimationFrame(() => {
      const top = formTopRef.current
        ? formTopRef.current.getBoundingClientRect().top + window.scrollY - 88
        : 0;
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    });
  };

  const next = async () => {
    const valid = await trigger(STEP_FIELDS[step] as any);
    if (valid) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      scrollToFormTop();
    }
  };
  const back = () => {
    setStep((s) => Math.max(s - 1, 0));
    scrollToFormTop();
  };

  const onSubmit = async (data: FormData) => {
    if (step !== STEPS.length - 1) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: data.tradeName || data.legalName,
        slug: data.legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50),
        legal_name: data.legalName,
        trade_name: data.tradeName || undefined,
        company_code: data.companyCode,
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
        registered_address: cleanAddressForPayload(data.registeredAddress),
        operational_address: data.sameAsRegistered ? undefined : cleanAddressForPayload(data.operationalAddress as any),
        estimated_branch_count: data.estimatedBranchCount ? Number(data.estimatedBranchCount) : undefined,
        estimated_employee_count: data.estimatedEmployeeCount ? Number(data.estimatedEmployeeCount) : undefined,
        business_category: data.businessCategory || undefined,
        current_hr_system: data.currentHrSystem || undefined,
        contact_person_name: data.contactPersonName,
        contact_designation: data.contactRole,
        contact_person_mobile: data.contactPersonMobile,
        contact_person_email: data.contactPersonEmail,
        fiscal_year_start: data.fiscalYearStart,
        timezone: data.timezone,
        currency: data.currency,
        lifecycleStage: 'pending_review',
        // Admin fields (used by backend to provision admin account)
        adminFullName: data.isExistingUser ? undefined : data.adminFullName,
        adminEmail: data.adminEmail,
        adminPassword: data.isExistingUser ? undefined : data.adminPassword,
      };

      const result = await createOpsOrganization(payload);
      if (sourceRequestId) {
        await organizationChangeRequestApi.fulfill(sourceRequestId, result.id);
      }
      router.push(`/operations/organizations/new/success?tenantId=${result.id}&name=${encodeURIComponent(data.legalName)}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Organization creation failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onInvalidSubmit = (formErrors: FieldErrors<FormData>) => {
    const firstMessage = findFirstErrorMessage(formErrors);
    setError(firstMessage ? `Cannot create organization: ${firstMessage}` : 'Complete the required fields before creating the organization.');
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

      {sourceRequestLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          <span className="animate-spin h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent inline-block" />
          Loading requested organization details...
        </div>
      )}

      {sourceRequest && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Creating from request for <span className="font-semibold">{sourceRequest.changes.additionalOrganization?.new?.organizationName}</span>.
          The request will be approved after this organization is created and assigned to {sourceRequest.requested_by_email}.
        </div>
      )}

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

      <form onSubmit={(event) => event.preventDefault()}>
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
          <div ref={formTopRef} className="xl:col-span-3 space-y-4">

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
                    <Field label="Company Code *" error={errors.companyCode?.message}>
                      <Input {...register('companyCode')} placeholder="ACME-CORP" />
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
                      <PhoneNumberInput value={watch('phoneNumber') || ''} onChange={(value) => setValue('phoneNumber', value, { shouldDirty: true, shouldValidate: true })} required />
                    </Field>
                    <Field label="Alternate Phone">
                      <PhoneNumberInput value={watch('alternatePhone') || ''} onChange={(value) => setValue('alternatePhone', value, { shouldDirty: true, shouldValidate: true })} />
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
                      <PhoneNumberInput value={watch('contactPersonMobile') || ''} onChange={(value) => setValue('contactPersonMobile', value, { shouldDirty: true, shouldValidate: true })} required />
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
                      <TimezoneSearchInput
                        value={watch('timezone')}
                        onChange={handleTimezoneChange}
                      />
                    </Field>
                    <Field label="Default Currency *" error={errors.currency?.message}>
                      <Select
                        value={watch('currency')}
                        onChange={(event) => setValue('currency', event.target.value, { shouldDirty: true, shouldValidate: true })}
                      >
                        {CURRENCY_OPTIONS.map((currency) => (
                          <option key={currency.value} value={currency.value}>{currency.label}</option>
                        ))}
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

                <Panel title="Business Context" subtitle="Optional details for onboarding">
                  <Grid2>
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
                  <AddressFields value={registeredAddress} onChange={(address) => setAddress('registeredAddress', address)} postalCodeKey="postal_code" required />
                  {errors.registeredAddress && <p className="text-xs text-destructive">Complete the required registered address fields.</p>}
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
                    <AddressFields value={operationalAddress || {}} onChange={(address) => setAddress('operationalAddress', address)} postalCodeKey="postal_code" />
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
                      <input
                        type="radio"
                        className="hidden"
                        checked={isExistingUser}
                        onChange={() => {
                          setValue('isExistingUser', true);
                          setClientUserSearch(getValues('adminEmail') || '');
                          trigger(['adminFullName', 'adminPassword']);
                        }}
                      />
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
                  {!isExistingUser ? (
                    <Field label="Email Address *" error={errors.adminEmail?.message}>
                      <InputIcon icon={<Mail className="h-4 w-4" />}>
                        <Input type="email" {...register('adminEmail')} placeholder="admin@company.com" className="pl-9" />
                      </InputIcon>
                    </Field>
                  ) : (
                    <Field label="Search Client-Side User *" error={errors.adminEmail?.message}>
                      <div className="relative">
                        <InputIcon icon={<Search className="h-4 w-4" />}>
                          <Input
                            type="search"
                            value={clientUserSearch}
                            onChange={(event) => {
                              const value = event.target.value;
                              setClientUserSearch(value);
                              setValue('adminEmail', value, { shouldDirty: true, shouldValidate: true });
                            }}
                            placeholder="Search by name, email, phone, employee code, or company"
                            className="pl-9 pr-10"
                          />
                        </InputIcon>
                        {clientUsersLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                      </div>
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-white">
                        {clientUsersError ? (
                          <div className="px-3 py-2 text-xs text-destructive">{clientUsersError}</div>
                        ) : clientUsers.length ? (
                          <div className="max-h-60 overflow-y-auto">
                            {clientUsers.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => selectExistingUser(user)}
                                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-violet-50 ${
                                  watch('adminEmail') === user.email ? 'bg-violet-50' : ''
                                }`}
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                                  <UserCheck className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-slate-700">{user.display_name || user.email}</div>
                                  <div className="truncate text-xs text-slate-500">
                                    {user.email}
                                    {user.tenant_name ? ` · ${user.tenant_name}` : ''}
                                  </div>
                                </div>
                                {!user.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Inactive</span>}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            {clientUsersLoading ? 'Searching client-side users...' : 'No client-side users found.'}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Select a customer user, or enter the exact email address if you already know it.</p>
                    </Field>
                  )}
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
                  <Row label="Fiscal Year"  value={FISCAL_MONTHS.find((m) => m.value === Number(watch('fiscalYearStart')))?.label} />
                  <Row label="Work Week"    value={DAYS.filter(({ key }) => workWeek[key]).map(({ label }) => label).join(', ')} />
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
                <Button type="button" onClick={handleSubmit(onSubmit, onInvalidSubmit)} disabled={submitting} className="gap-2 bg-violet-600 hover:bg-violet-700 min-w-[160px]">
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

function cleanAddressForPayload(address: AddressValue) {
  return {
    line1: address.line1 || '',
    line2: address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    country: address.country || '',
    postal_code: address.postal_code || address.pincode || '',
  };
}

function normalizeCompanyType(value: unknown) {
  const key = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  return COMPANY_TYPE_ALIASES[key] ?? COMPANY_TYPE_ALIASES[key.replace(/_/g, ' ')] ?? '';
}

function deriveCompanyCode(name: string) {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 20);
  return code || 'ORG';
}

function emailOrBlank(value: unknown) {
  const email = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function findFirstErrorMessage(errors: FieldErrors<FormData>): string {
  for (const value of Object.values(errors)) {
    if (!value) continue;
    if (typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
      return value.message;
    }
    if (typeof value === 'object') {
      const nested = findFirstErrorMessage(value as FieldErrors<FormData>);
      if (nested) return nested;
    }
  }
  return '';
}

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

function TimezoneSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = TIMEZONE_OPTIONS.find((timezone) => timezone.value === value) ?? TIMEZONE_OPTIONS[0];
  const [query, setQuery] = useState(selected.label);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const positionDropdown = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(140, Math.min(preferredHeight, openAbove ? spaceAbove : spaceBelow)),
    });
  }, []);

  useEffect(() => {
    setQuery(selected.label);
  }, [selected.label]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected.label);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [selected.label]);

  useEffect(() => {
    if (!open) return;

    positionDropdown();
    const updatePosition = () => positionDropdown();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, positionDropdown]);

  const filteredTimezones = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return TIMEZONE_OPTIONS;

    return TIMEZONE_OPTIONS.filter((timezone) =>
      timezone.value.toLowerCase().includes(normalized) ||
      timezone.label.toLowerCase().includes(normalized)
    );
  }, [query]);

  const findTimezone = (input: string) => {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return undefined;

    return TIMEZONE_OPTIONS.find((timezone) =>
      timezone.value.toLowerCase() === normalized ||
      timezone.label.toLowerCase() === normalized
    ) ?? TIMEZONE_OPTIONS.find((timezone) =>
      timezone.value.toLowerCase().includes(normalized) ||
      timezone.label.toLowerCase().includes(normalized)
    );
  };

  const commit = (input: string) => {
    const match = findTimezone(input);
    if (match) {
      onChange(match.value);
      setQuery(match.label);
      setOpen(false);
      return;
    }
    setQuery(selected.label);
    setOpen(false);
  };

  const chooseTimezone = (timezone: (typeof TIMEZONE_OPTIONS)[number]) => {
    onChange(timezone.value);
    setQuery(timezone.label);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <InputIcon icon={<Search className="h-4 w-4" />}>
        <Input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            setActiveIndex(0);

            const exact = findTimezone(next);
            if (exact && (exact.label === next || exact.value === next)) {
              onChange(exact.value);
            }
          }}
          onBlur={(event) => {
            if (!containerRef.current?.contains(event.relatedTarget as Node)) {
              commit(event.target.value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, filteredTimezones.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const timezone = filteredTimezones[activeIndex] ?? findTimezone(query);
              if (timezone) chooseTimezone(timezone);
            } else if (event.key === 'Escape') {
              setOpen(false);
              setQuery(selected.label);
            }
          }}
          placeholder="Search timezone"
          className="pl-9"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </InputIcon>

      {open && (
        <div
          className="z-[100] overflow-hidden rounded-md border border-input bg-background shadow-lg"
          style={dropdownStyle}
        >
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filteredTimezones.length ? (
              filteredTimezones.map((timezone, index) => (
                <button
                  key={timezone.value}
                  type="button"
                  role="option"
                  aria-selected={timezone.value === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseTimezone(timezone)}
                  className={[
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                    index === activeIndex ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-50',
                    timezone.value === value ? 'font-medium text-primary' : '',
                  ].join(' ')}
                >
                  <span className="truncate">{timezone.label}</span>
                  {timezone.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No timezone found</div>
            )}
          </div>
        </div>
      )}
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
