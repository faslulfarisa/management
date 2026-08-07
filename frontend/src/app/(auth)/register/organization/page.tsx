'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck,
  MapPin, UserSquare2, Gift,
} from 'lucide-react';
import { registrationApi } from '@/lib/organization-registration-api';
import { publicSignupOffersApi, PublicSignupOffer } from '@/lib/signup-offers-api';
import { useRegistrationStore } from '@/store/registration.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthBrandMark } from '@/components/auth/auth-hero-panel';
import { RegistrationProgress } from '@/components/auth/registration-progress';
import AddressFields, { type AddressValue } from '@/components/forms/AddressFields';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';

const COMPANY_TYPES: { value: string; label: string }[] = [
  { value: 'private_limited', label: 'Private Limited' },
  { value: 'public_limited', label: 'Public Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'ngo', label: 'NGO / Non-Profit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const addressSchema = z.object({
  line1: z.string().min(1, 'Address line is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  stateCode: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  countryCode: z.string().optional(),
  postal_code: z.string().min(1, 'Postal code is required'),
});

const schema = z.object({
  legalName: z.string().min(1, 'Legal company name is required'),
  tradeName: z.string().optional(),
  companyCode: z.string().trim().min(1, 'Company code is required'),
  companyType: z.string().min(1, 'Select a company type'),
  registrationNumber: z.string().optional(),
  gstin: z.string().optional(),
  panNumber: z.string().optional(),
  cinNumber: z.string().optional(),
  industry: z.string().optional(),
  websiteUrl: z.string().optional(),
  corporateEmail: z.string().min(1, 'Business email is required').email('Enter a valid email address'),
  supportEmail: z.union([z.string().email('Enter a valid email address'), z.literal('')]).optional(),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  alternatePhone: z.string().optional(),

  registeredAddress: addressSchema,
  sameAsRegistered: z.boolean().optional(),
  operationalAddress: addressSchema.partial().optional(),

  estimatedBranchCount: z.union([z.coerce.number().int().min(1), z.literal('')]).optional(),
  estimatedEmployeeCount: z.union([z.coerce.number().int().min(1), z.literal('')]).optional(),
  businessCategory: z.string().optional(),
  currentHrSystem: z.string().optional(),

  contactPersonName: z.string().min(1, 'Contact person name is required'),
  contactDesignation: z.string().min(1, 'Designation is required'),
  contactPersonMobile: z.string().min(1, 'Mobile number is required'),
  contactPersonEmail: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type FormData = z.infer<typeof schema>;

const STEPS = [
  { label: 'Organization', icon: Building2 },
  { label: 'Address', icon: MapPin },
  { label: 'Requirements', icon: ClipboardCheck },
  { label: 'Contact', icon: UserSquare2 },
  { label: 'Review', icon: Check },
];

const STEP_FIELDS: (keyof FormData)[][] = [
  ['legalName', 'tradeName', 'companyCode', 'companyType', 'registrationNumber', 'gstin', 'panNumber', 'cinNumber', 'industry', 'estimatedBranchCount', 'estimatedEmployeeCount', 'websiteUrl', 'corporateEmail', 'supportEmail', 'phoneNumber', 'alternatePhone'],
  ['registeredAddress', 'sameAsRegistered', 'operationalAddress'],
  ['businessCategory', 'currentHrSystem'],
  ['contactPersonName', 'contactDesignation', 'contactPersonMobile', 'contactPersonEmail'],
  [],
];

export default function OrganizationSetupPage() {
  const router = useRouter();
  const { session, hydrate, clear } = useRegistrationStore();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showCompliance, setShowCompliance] = useState(false);

  const [offers, setOffers] = useState<PublicSignupOffer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | undefined>(undefined);
  const [promoCode, setPromoCode] = useState('');
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [appliedCodeOffer, setAppliedCodeOffer] = useState<PublicSignupOffer | null>(null);

  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyType: '',
      companyCode: '',
      sameAsRegistered: true,
      registeredAddress: { line1: '', line2: '', city: '', state: '', country: '', postal_code: '' },
    },
  });

  useEffect(() => {
    hydrate();
    setHydrated(true);
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session && !submitted) {
      router.replace('/register');
      return;
    }
  }, [hydrated, session, submitted, router]);

  useEffect(() => {
    if (!hydrated || !session) return;
    publicSignupOffersApi.listActive().then(setOffers).catch(() => {});
  }, [hydrated, session]);

  const handleApplyCode = async () => {
    if (!promoCode.trim()) return;
    setPromoChecking(true);
    setPromoError('');
    try {
      const offer = await publicSignupOffersApi.validateCode(promoCode.trim());
      setAppliedCodeOffer(offer);
      setSelectedOfferId(offer.id);
      setPromoCode(offer.code ?? promoCode.trim().toUpperCase());
    } catch (err: any) {
      setPromoError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Invalid or expired code');
    } finally {
      setPromoChecking(false);
    }
  };

  const availableOffers = appliedCodeOffer && !offers.some((o) => o.id === appliedCodeOffer.id)
    ? [...offers, appliedCodeOffer]
    : offers;

  const handleSelectOffer = (offerId: string | undefined) => {
    setSelectedOfferId(offerId);
    setPromoError('');

    if (!offerId) {
      setPromoCode('');
      return;
    }

    const offer = availableOffers.find((item) => item.id === offerId);
    setPromoCode(offer?.code ?? '');
  };

  const sameAsRegistered = watch('sameAsRegistered');
  const registeredAddress = watch('registeredAddress') as AddressValue;
  const operationalAddress = watch('operationalAddress') as AddressValue;

  const setAddress = (key: 'registeredAddress' | 'operationalAddress', address: AddressValue) => {
    setValue(key, address as any, { shouldDirty: true, shouldValidate: true });
  };

  const next = async () => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: FormData) => {
    if (!session) return;
    if (step !== STEPS.length - 1) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await registrationApi.submitOrganization({
        registrationId: session.registrationId,
        accessToken: session.accessToken,
        legalName: data.legalName,
        tradeName: data.tradeName || undefined,
        companyCode: data.companyCode,
        companyType: data.companyType,
        registrationNumber: data.registrationNumber || undefined,
        gstin: data.gstin || undefined,
        panNumber: data.panNumber || undefined,
        cinNumber: data.cinNumber || undefined,
        industry: data.industry || undefined,
        websiteUrl: data.websiteUrl || undefined,
        corporateEmail: data.corporateEmail,
        supportEmail: data.supportEmail || undefined,
        phoneNumber: data.phoneNumber,
        alternatePhone: data.alternatePhone || undefined,
        registeredAddress: cleanRegistrationAddress(data.registeredAddress),
        operationalAddress: data.sameAsRegistered ? undefined : cleanRegistrationAddress(data.operationalAddress as any),
        estimatedBranchCount: data.estimatedBranchCount ? Number(data.estimatedBranchCount) : undefined,
        estimatedEmployeeCount: data.estimatedEmployeeCount ? Number(data.estimatedEmployeeCount) : undefined,
        businessCategory: data.businessCategory || undefined,
        currentHrSystem: data.currentHrSystem || undefined,
        contactPersonName: data.contactPersonName,
        contactDesignation: data.contactDesignation,
        contactPersonMobile: data.contactPersonMobile,
        contactPersonEmail: data.contactPersonEmail,
        offerId: selectedOfferId,
      });
      setSubmitted(true);
      router.push(`/register/pending?tenantId=${result.tenantId}`);
      clear();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated || !session) return null;

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <AuthBrandMark variant="light" />
        </div>

        <RegistrationProgress step={2} />

        <div className="mb-2 text-sm text-muted-foreground">
          Tell us about your organization — our onboarding team will review and activate your workspace.
        </div>

        <div className="mb-8 mt-6 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <div key={s.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                    done ? 'border-indigo-600 bg-indigo-600 text-white' : active ? 'border-indigo-600 text-indigo-600' : 'border-border text-muted-foreground'
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`mx-2 h-0.5 flex-1 ${done ? 'bg-indigo-600' : 'bg-border'}`} />}
              </div>
            );
          })}
        </div>

        <form onSubmit={(event) => event.preventDefault()} className="rounded-2xl border border-border bg-white p-8 shadow-sm space-y-6 animate-fade-in">
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Organization Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Legal Company Name *" error={errors.legalName?.message}>
                  <Input {...register('legalName')} placeholder="Acme Corporation Pvt Ltd" />
                </Field>
                <Field label="Organization Name" error={errors.tradeName?.message}>
                  <Input {...register('tradeName')} placeholder="Acme (defaults to legal name)" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Company Code *" error={errors.companyCode?.message}>
                  <Input {...register('companyCode')} placeholder="ACME-CORP" />
                </Field>
                <Field label="Company Type *" error={errors.companyType?.message}>
                  <select {...register('companyType')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">- Select type -</option>
                    {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Industry" error={errors.industry?.message}>
                  <Input {...register('industry')} placeholder="e.g. Information Technology" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Number of Employees">
                  <Input type="number" min={1} {...register('estimatedEmployeeCount')} placeholder="e.g. 120" />
                </Field>
                <Field label="Number of Branches">
                  <Input type="number" min={1} {...register('estimatedBranchCount')} placeholder="e.g. 3" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Website" error={errors.websiteUrl?.message}>
                  <Input {...register('websiteUrl')} placeholder="https://example.com" />
                </Field>
                <Field label="Business Email *" error={errors.corporateEmail?.message}>
                  <Input type="email" {...register('corporateEmail')} placeholder="contact@company.com" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone Number *" error={errors.phoneNumber?.message}>
                  <PhoneNumberInput value={watch('phoneNumber') || ''} onChange={(value) => setValue('phoneNumber', value, { shouldDirty: true, shouldValidate: true })} required />
                </Field>
              </div>

              <details className="group rounded-lg border border-dashed border-border" open={showCompliance} onToggle={(e) => setShowCompliance((e.target as HTMLDetailsElement).open)}>
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                  Compliance &amp; tax details <span className="text-muted-foreground font-normal">(optional)</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-dashed border-border p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Registration Number" error={errors.registrationNumber?.message}>
                      <Input {...register('registrationNumber')} />
                    </Field>
                    <Field label="GST Number" error={errors.gstin?.message}>
                      <Input {...register('gstin')} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="PAN Number" error={errors.panNumber?.message}>
                      <Input {...register('panNumber')} />
                    </Field>
                    <Field label="CIN Number" error={errors.cinNumber?.message}>
                      <Input {...register('cinNumber')} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Alternate Phone" error={errors.alternatePhone?.message}>
                      <PhoneNumberInput value={watch('alternatePhone') || ''} onChange={(value) => setValue('alternatePhone', value, { shouldDirty: true, shouldValidate: true })} />
                    </Field>
                    <Field label="Support Email" error={errors.supportEmail?.message}>
                      <Input type="email" {...register('supportEmail')} placeholder="support@company.com" />
                    </Field>
                  </div>
                </div>
              </details>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Registered Address</h3>
              <AddressFields value={registeredAddress} onChange={(address) => setAddress('registeredAddress', address)} postalCodeKey="postal_code" required />
              {errors.registeredAddress && <p className="text-xs text-destructive">Complete the required registered address fields.</p>}

              <label className="flex items-center gap-2 pt-2 text-sm text-foreground">
                <input type="checkbox" {...register('sameAsRegistered')} className="h-4 w-4 rounded border-input accent-primary" />
                Operational address is the same as registered address
              </label>

              {!sameAsRegistered && (
                <div className="space-y-4 rounded-lg border border-dashed border-border p-4">
                  <h4 className="text-sm font-semibold text-foreground">Operational Address</h4>
                  <AddressFields value={operationalAddress || {}} onChange={(address) => setAddress('operationalAddress', address)} postalCodeKey="postal_code" />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Business Context</h3>
              <p className="text-sm text-muted-foreground">Tell us about your current HR setup so our team can tailor your onboarding.</p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <Field label="Business Category">
                  <Input {...register('businessCategory')} placeholder="e.g. Manufacturing, Retail, IT Services" />
                </Field>
                <Field label="Current HR System">
                  <Input {...register('currentHrSystem')} placeholder="Spreadsheets, none, etc." />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Primary Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Person Name *" error={errors.contactPersonName?.message}>
                  <Input {...register('contactPersonName')} />
                </Field>
                <Field label="Designation *" error={errors.contactDesignation?.message}>
                  <Input {...register('contactDesignation')} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Mobile Number *" error={errors.contactPersonMobile?.message}>
                  <PhoneNumberInput value={watch('contactPersonMobile') || ''} onChange={(value) => setValue('contactPersonMobile', value, { shouldDirty: true, shouldValidate: true })} required />
                </Field>
                <Field label="Email *" error={errors.contactPersonEmail?.message}>
                  <Input type="email" {...register('contactPersonEmail')} />
                </Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <>
              <ReviewStep getValues={watch} />
              <OffersPicker
                offers={availableOffers}
                selectedOfferId={selectedOfferId}
                onSelect={handleSelectOffer}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                onApplyCode={handleApplyCode}
                promoChecking={promoChecking}
                promoError={promoError}
                appliedOffer={appliedCodeOffer}
              />
            </>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={back} disabled={step === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit(onSubmit)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for Review'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function cleanRegistrationAddress(address: AddressValue) {
  return {
    line1: address.line1 || '',
    line2: address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    country: address.country || '',
    postal_code: address.postal_code || address.pincode || '',
  };
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ReviewStep({ getValues }: { getValues: (name?: any) => any }) {
  const data = getValues();

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Review &amp; Submit</h3>
      <p className="text-sm text-muted-foreground">
        Please review your details below. After submitting, your organization will be marked <strong>Pending Approval</strong> until our onboarding team reviews it.
      </p>
      <div className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm">
        <Row label="Organization Name" value={data.tradeName || data.legalName} />
        <Row label="Legal Name" value={data.legalName} />
        <Row label="Company Code" value={data.companyCode} />
        <Row label="Company Type" value={COMPANY_TYPES.find((t) => t.value === data.companyType)?.label} />
        <Row label="Industry" value={data.industry} />
        <Row label="Business Email" value={data.corporateEmail} />
        <Row label="Phone" value={data.phoneNumber} />
        <Row label="Registered Address" value={[data.registeredAddress?.line1, data.registeredAddress?.city, data.registeredAddress?.state, data.registeredAddress?.country].filter(Boolean).join(', ')} />
        <Row label="Contact Person" value={`${data.contactPersonName ?? ''} (${data.contactDesignation ?? ''})`} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

function offerValueLabel(offer: PublicSignupOffer): string {
  if (offer.offer_type === 'free_trial') return `${offer.trial_days} day${offer.trial_days === 1 ? '' : 's'} free`;
  if (offer.offer_type === 'discount_percent') return `${offer.discount_percent}% off`;
  if (offer.offer_type === 'discount_flat') return `₹${offer.discount_amount} off`;
  return '';
}

function OffersPicker({
  offers, selectedOfferId, onSelect, promoCode, setPromoCode, onApplyCode, promoChecking, promoError, appliedOffer,
}: {
  offers: PublicSignupOffer[];
  selectedOfferId?: string;
  onSelect: (id: string | undefined) => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  onApplyCode: () => void;
  promoChecking: boolean;
  promoError: string;
  appliedOffer: PublicSignupOffer | null;
}) {
  if (offers.length === 0 && !appliedOffer) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Gift className="h-4 w-4 text-indigo-600" /> Have a promo code?
        </h4>
        <div className="flex items-center gap-2">
          <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Enter promo code" className="max-w-xs" />
          <Button type="button" variant="outline" onClick={onApplyCode} disabled={!promoCode || promoChecking}>
            {promoChecking ? 'Checking…' : 'Apply'}
          </Button>
        </div>
        {promoError && <p className="text-xs text-destructive">{promoError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Gift className="h-4 w-4 text-indigo-600" /> Special Offers
      </h4>
      <div className="space-y-2">
        {offers.map((o) => (
          <label
            key={o.id}
            className={`flex items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
              selectedOfferId === o.id ? 'border-indigo-500 bg-white' : 'border-border bg-white/60 hover:bg-white'
            }`}
          >
            <input
              type="radio"
              name="signup-offer"
              checked={selectedOfferId === o.id}
              onChange={() => onSelect(o.id)}
              className="h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <div className="font-medium text-foreground">{o.name}</div>
              {o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}
              {o.code && (
                <div className="mt-1 text-xs font-medium text-indigo-700">
                  Promo code: <span className="font-semibold">{o.code}</span>
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-indigo-700 shrink-0">{offerValueLabel(o)}</span>
          </label>
        ))}
        {selectedOfferId && (
          <button type="button" onClick={() => onSelect(undefined)} className="text-xs text-muted-foreground underline">
            Don&apos;t apply an offer
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="Have another promo code?" className="max-w-xs" />
        <Button type="button" variant="outline" onClick={onApplyCode} disabled={!promoCode || promoChecking}>
          {promoChecking ? 'Checking…' : 'Apply'}
        </Button>
      </div>
      {promoError && <p className="text-xs text-destructive">{promoError}</p>}
    </div>
  );
}
