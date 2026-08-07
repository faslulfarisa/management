'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AddressFields from '@/components/forms/AddressFields';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import { ORG_LIFECYCLE_LABELS, type OrgLifecycleStage } from '@/lib/organization-lifecycle';
import type { OpsOrganization } from '@/lib/operations-api';
import { DEFAULT_CURRENCY_CODE, SUPPORTED_CURRENCIES, getCurrencyDefinition } from '@/lib/currency';

interface AddressValues {
  line1: string;
  line2: string;
  city: string;
  state: string;
  stateCode?: string;
  country: string;
  countryCode?: string;
  postal_code: string;
}

export interface OrgFormValues {
  name: string;
  slug: string;
  legal_name: string;
  trade_name: string;
  company_code: string;
  company_type: string;
  company_size: string;
  registration_number: string;
  gstin: string;
  pan_number: string;
  cin_number: string;
  industry: string;
  estimated_employee_count: string;
  estimated_branch_count: string;
  primary_email: string;
  support_email: string;
  phone_number: string;
  alternate_phone: string;
  website_url: string;
  contact_person_name: string;
  contact_designation: string;
  contact_person_mobile: string;
  contact_person_email: string;
  fiscal_year_start: string;
  timezone: string;
  currency: string;
  date_format: string;
  emp_code_prefix: string;
  emp_code_digits: string;
  max_failed_login_attempts: string;
  business_category: string;
  current_hr_system: string;
  registered_address: AddressValues;
  same_as_registered: boolean;
  operational_address: AddressValues;
  lifecycleStage: OrgLifecycleStage;
}

const CREATABLE_STAGES: OrgLifecycleStage[] = ['pending_review', 'pending_approval'];

const COMPANY_TYPES = [
  { value: '', label: 'Select company type' },
  { value: 'private_limited', label: 'Private Limited' },
  { value: 'public_limited', label: 'Public Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'ngo', label: 'NGO / Non-Profit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MMM DD, YYYY'];

const emptyAddress = (): AddressValues => ({
  line1: '',
  line2: '',
    city: '',
    state: '',
    stateCode: '',
    country: '',
    countryCode: '',
    postal_code: '',
});

const emptyValues = (): OrgFormValues => ({
  name: '',
  slug: '',
  legal_name: '',
  trade_name: '',
  company_code: '',
  company_type: '',
  company_size: '',
  registration_number: '',
  gstin: '',
  pan_number: '',
  cin_number: '',
  industry: '',
  estimated_employee_count: '',
  estimated_branch_count: '',
  primary_email: '',
  support_email: '',
  phone_number: '',
  alternate_phone: '',
  website_url: '',
  contact_person_name: '',
  contact_designation: '',
  contact_person_mobile: '',
  contact_person_email: '',
  fiscal_year_start: '4',
  timezone: 'Asia/Kolkata',
  currency: DEFAULT_CURRENCY_CODE,
  date_format: 'DD/MM/YYYY',
  emp_code_prefix: '',
  emp_code_digits: '4',
  max_failed_login_attempts: '5',
  business_category: '',
  current_hr_system: '',
  registered_address: emptyAddress(),
  same_as_registered: true,
  operational_address: emptyAddress(),
  lifecycleStage: 'pending_review',
});

function addressFrom(value: Record<string, any> | null | undefined): AddressValues {
  return {
    line1: String(value?.line1 ?? ''),
    line2: String(value?.line2 ?? ''),
    city: String(value?.city ?? ''),
    state: String(value?.state ?? ''),
    stateCode: String(value?.stateCode ?? ''),
    country: String(value?.country ?? ''),
    countryCode: String(value?.countryCode ?? ''),
    postal_code: String(value?.postal_code ?? ''),
  };
}

function hasAddress(value: AddressValues) {
  return Object.values(value).some((part) => part.trim());
}

function valuesFromOrganization(organization: OpsOrganization): OrgFormValues {
  const registeredAddress = addressFrom(organization.registered_address);
  const operationalAddress = addressFrom(organization.operational_address);

  return {
    ...emptyValues(),
    name: organization.name || '',
    slug: organization.slug || '',
    legal_name: organization.legal_name || organization.name || '',
    trade_name: organization.trade_name || '',
    company_code: organization.company_code || '',
    company_type: organization.company_type || '',
    company_size: organization.company_size || '',
    registration_number: organization.registration_number || '',
    gstin: organization.gstin || '',
    pan_number: organization.pan_number || '',
    cin_number: organization.cin_number || '',
    industry: organization.industry || '',
    estimated_employee_count: organization.estimated_employee_count ? String(organization.estimated_employee_count) : '',
    estimated_branch_count: organization.estimated_branch_count ? String(organization.estimated_branch_count) : '',
    primary_email: organization.primary_email || '',
    support_email: organization.support_email || '',
    phone_number: organization.phone_number || '',
    alternate_phone: organization.alternate_phone || '',
    website_url: organization.website_url || '',
    contact_person_name: organization.contact_person_name || '',
    contact_designation: organization.contact_designation || '',
    contact_person_mobile: organization.contact_person_mobile || '',
    contact_person_email: organization.contact_person_email || '',
    fiscal_year_start: organization.fiscal_year_start ? String(organization.fiscal_year_start) : '4',
    timezone: organization.timezone || 'Asia/Kolkata',
    currency: organization.currency || DEFAULT_CURRENCY_CODE,
    date_format: organization.date_format || 'DD/MM/YYYY',
    emp_code_prefix: organization.emp_code_prefix || '',
    emp_code_digits: organization.emp_code_digits ? String(organization.emp_code_digits) : '4',
    max_failed_login_attempts: organization.max_failed_login_attempts ? String(organization.max_failed_login_attempts) : '5',
    business_category: organization.business_category || '',
    current_hr_system: organization.current_hr_system || '',
    registered_address: registeredAddress,
    same_as_registered: !hasAddress(operationalAddress),
    operational_address: operationalAddress,
    lifecycleStage: organization.lifecycle_stage,
  };
}

export function OrgFormDialog({
  open,
  onClose,
  onSubmit,
  organization,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OrgFormValues) => Promise<void>;
  organization?: OpsOrganization | null;
  submitting?: boolean;
}) {
  const isEdit = !!organization;
  const [values, setValues] = useState<OrgFormValues>(emptyValues);
  const [error, setError] = useState('');

  useEffect(() => {
    setValues(organization ? valuesFromOrganization(organization) : emptyValues());
    setError('');
  }, [organization, open]);

  const set = <K extends keyof OrgFormValues>(key: K, value: OrgFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!values.name.trim() || !values.legal_name.trim()) {
      setError('Organization name and legal name are required');
      return;
    }
    if (!values.primary_email.trim()) {
      setError('Primary email is required');
      return;
    }
    if (!values.company_code.trim()) {
      setError('Company code is required');
      return;
    }
    if (!values.phone_number.trim()) {
      setError('Phone number is required');
      return;
    }
    if (!values.currency.trim()) {
      setError('Currency is required');
      return;
    }
    setError('');
    try {
      await onSubmit(values);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Organization' : 'New Organization'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the customer profile, legal details, contacts, operations settings, and addresses.' : 'Create a customer organization profile.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="space-y-5">
          <Section title="Business Identity">
            <Field label="Organization Name *">
              <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Hotels" />
            </Field>
            <Field label="Legal Name *">
              <Input value={values.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder="Acme Hotels Pvt Ltd" />
            </Field>
            <Field label="Trade Name">
              <Input value={values.trade_name} onChange={(e) => set('trade_name', e.target.value)} placeholder="Acme" />
            </Field>
            <Field label="Industry">
              <Input value={values.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Hospitality" />
            </Field>
            <Field label="Slug">
              <Input value={values.slug} disabled />
            </Field>
            <Field label="Company Code">
              <Input value={values.company_code} onChange={(e) => set('company_code', e.target.value.trim().toUpperCase())} />
            </Field>
            <Field label="Company Type">
              <Select value={values.company_type} onChange={(value) => set('company_type', value)}>
                {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
            </Field>
            <Field label="Estimated Employees">
              <Input type="number" min={1} value={values.estimated_employee_count} onChange={(e) => set('estimated_employee_count', e.target.value)} />
            </Field>
            <Field label="Estimated Branches">
              <Input type="number" min={1} value={values.estimated_branch_count} onChange={(e) => set('estimated_branch_count', e.target.value)} />
            </Field>
            <Field label="Business Category">
              <Input value={values.business_category} onChange={(e) => set('business_category', e.target.value)} />
            </Field>
            <Field label="Current HR System">
              <Input value={values.current_hr_system} onChange={(e) => set('current_hr_system', e.target.value)} />
            </Field>
          </Section>

          <Section title="Registration Details">
            <Field label="Registration Number">
              <Input value={values.registration_number} onChange={(e) => set('registration_number', e.target.value)} />
            </Field>
            <Field label="GST / VAT">
              <Input value={values.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
            </Field>
            <Field label="PAN / TIN">
              <Input value={values.pan_number} onChange={(e) => set('pan_number', e.target.value.toUpperCase())} />
            </Field>
            <Field label="CIN">
              <Input value={values.cin_number} onChange={(e) => set('cin_number', e.target.value.toUpperCase())} />
            </Field>
          </Section>

          <Section title="Contact">
            <Field label="Primary Email *">
              <Input type="email" value={values.primary_email} onChange={(e) => set('primary_email', e.target.value)} />
            </Field>
            <Field label="Support Email">
              <Input type="email" value={values.support_email} onChange={(e) => set('support_email', e.target.value)} />
            </Field>
            <Field label="Phone *">
              <PhoneNumberInput value={values.phone_number} onChange={(value) => set('phone_number', value)} required />
            </Field>
            <Field label="Alternate Phone">
              <PhoneNumberInput value={values.alternate_phone} onChange={(value) => set('alternate_phone', value)} />
            </Field>
            <Field label="Website">
              <Input value={values.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://example.com" />
            </Field>
          </Section>

          <Section title="Primary Contact">
            <Field label="Contact Name">
              <Input value={values.contact_person_name} onChange={(e) => set('contact_person_name', e.target.value)} />
            </Field>
            <Field label="Designation">
              <Input value={values.contact_designation} onChange={(e) => set('contact_designation', e.target.value)} />
            </Field>
            <Field label="Mobile">
              <PhoneNumberInput value={values.contact_person_mobile} onChange={(value) => set('contact_person_mobile', value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={values.contact_person_email} onChange={(e) => set('contact_person_email', e.target.value)} />
            </Field>
          </Section>

          <Section title="Operations">
            <Field label="Timezone">
              <Input value={values.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Asia/Kolkata" />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={values.currency} onChange={(value) => set('currency', value)} />
            </Field>
            <Field label="Date Format">
              <Select value={values.date_format} onChange={(value) => set('date_format', value)}>
                {DATE_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
              </Select>
            </Field>
            <Field label="Fiscal Year Start">
              <Input type="number" min={1} max={12} value={values.fiscal_year_start} onChange={(e) => set('fiscal_year_start', e.target.value)} />
            </Field>
            <Field label="Employee Code Prefix">
              <Input value={values.emp_code_prefix} onChange={(e) => set('emp_code_prefix', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Employee Code Digits">
              <Input type="number" min={1} max={12} value={values.emp_code_digits} onChange={(e) => set('emp_code_digits', e.target.value)} />
            </Field>
            <Field label="Max Login Failures">
              <Input type="number" min={1} max={20} value={values.max_failed_login_attempts} onChange={(e) => set('max_failed_login_attempts', e.target.value)} />
            </Field>
          </Section>

          <AddressSection
            title="Registered Address"
            value={values.registered_address}
            onChange={(address) => set('registered_address', address)}
          />

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={values.same_as_registered}
                onChange={(e) => set('same_as_registered', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-violet-600"
              />
              Operational address is the same as registered address
            </label>
            {!values.same_as_registered && (
              <AddressSection
                title="Operational Address"
                value={values.operational_address}
                onChange={(address) => set('operational_address', address)}
              />
            )}
          </div>

          {!isEdit && (
            <Section title="Lifecycle">
              <Field label="Starting Stage">
                <Select value={values.lifecycleStage} onChange={(value) => set('lifecycleStage', value as OrgLifecycleStage)}>
                  {CREATABLE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>{ORG_LIFECYCLE_LABELS[stage]}</option>
                  ))}
                </Select>
              </Field>
            </Section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function AddressSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AddressValues;
  onChange: (value: AddressValues) => void;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      <AddressFields
        value={value}
        onChange={(address) => onChange(address as AddressValues)}
        postalCodeKey="postal_code"
        required
      />
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </select>
  );
}

function CurrencySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = getCurrencyDefinition(value);
  const displayValue = `${selected.code} ${selected.symbol} - ${selected.name} (${selected.country})`;

  const normalizeInput = (input: string) => {
    const raw = input.trim();
    const match = SUPPORTED_CURRENCIES.find((currency) => {
      const label = `${currency.code} ${currency.symbol} - ${currency.name} (${currency.country})`;
      return currency.code === raw.toUpperCase() || label.toLowerCase() === raw.toLowerCase();
    });
    onChange((match ?? selected).code);
  };

  return (
    <div className="space-y-1">
      <Input
        list="organization-currencies"
        defaultValue={displayValue}
        key={selected.code}
        onBlur={(e) => normalizeInput(e.target.value)}
        onChange={(e) => {
          const code = e.target.value.trim().split(/\s+/)[0]?.toUpperCase();
          if (SUPPORTED_CURRENCIES.some((currency) => currency.code === code)) onChange(code);
        }}
      />
      <datalist id="organization-currencies">
        {SUPPORTED_CURRENCIES.map((currency) => (
          <option key={currency.code} value={`${currency.code} ${currency.symbol} - ${currency.name} (${currency.country})`}>
            {currency.code} {currency.symbol} - {currency.name} ({currency.country})
          </option>
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        {selected.name} ({selected.code}) · {selected.symbol} · {selected.country}
      </p>
    </div>
  );
}

