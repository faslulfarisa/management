'use client';

import { useState, useEffect } from 'react';
import { profileApi } from '@/lib/company-profile-api';
import type { UpdateCoreInfoPayload, CompanyType } from '@/lib/company-profile-api';
import { organizationChangeRequestApi, OrganizationChangeRequest } from '@/lib/organization-registration-api';
import { useAuthStore } from '@/store/auth.store';
import { RequestChangeModal, ProtectedField } from '@/components/company-profile/RequestChangeModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RefreshCw, Lock, Clock3 } from 'lucide-react';

const COMPANY_TYPES: { value: CompanyType; label: string }[] = [
  { value: 'private_limited',     label: 'Private Limited' },
  { value: 'public_limited',      label: 'Public Limited' },
  { value: 'llp',                 label: 'LLP' },
  { value: 'partnership',         label: 'Partnership' },
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'ngo',                 label: 'NGO / Non-Profit' },
  { value: 'government',          label: 'Government' },
  { value: 'other',               label: 'Other' },
];

const FISCAL_MONTHS = [
  { value: 1,  label: 'January (Jan–Dec)' },
  { value: 4,  label: 'April (Apr–Mar)' },
  { value: 7,  label: 'July (Jul–Jun)' },
  { value: 10, label: 'October (Oct–Sep)' },
];

type FormState = Omit<UpdateCoreInfoPayload, 'fiscalYearStart'> & { name: string; fiscalYearStart: number };

const EMPTY: FormState = {
  name: '',
  legalName: '',
  tradeName: '',
  companyCode: '',
  registrationNumber: '',
  gstin: '',
  panNumber: '',
  cinNumber: '',
  companyType: undefined,
  fiscalYearStart: 4,
};

const PROTECTED_FIELD_DEFS: { key: keyof FormState; label: string }[] = [
  { key: 'legalName', label: 'Legal Business Name' },
  { key: 'tradeName', label: 'Trade Name' },
  { key: 'companyType', label: 'Company Type' },
  { key: 'registrationNumber', label: 'Registration Number' },
  { key: 'gstin', label: 'GST / VAT Number' },
  { key: 'panNumber', label: 'PAN / TIN Number' },
  { key: 'cinNumber', label: 'CIN / Business License' },
];

export default function GeneralPage() {
  const { userType, activeOrganization } = useAuthStore();
  const canEditProtectedFields = userType === 'org_admin' || !!activeOrganization?.isOrgAdmin;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [myRequests, setMyRequests] = useState<OrganizationChangeRequest[]>([]);

  useEffect(() => {
    profileApi.get().then((p) => {
      setForm({
        name:               p.name ?? '',
        legalName:          p.legal_name ?? '',
        tradeName:          p.trade_name ?? '',
        companyCode:        p.company_code ?? '',
        registrationNumber: p.registration_number ?? '',
        gstin:              p.gstin ?? '',
        panNumber:          p.pan_number ?? '',
        cinNumber:          p.cin_number ?? '',
        companyType:        p.company_type ?? undefined,
        fiscalYearStart:    p.fiscal_year_start ?? 4,
      });
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));

    if (!canEditProtectedFields) {
      organizationChangeRequestApi.listMine().then(setMyRequests).catch(() => {});
    }
  }, [canEditProtectedFields]);

  const set = (key: keyof FormState, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Org admins can't directly edit protected fields — omit them entirely
      // so the backend doesn't treat unchanged values as a change request.
      const payload = canEditProtectedFields
        ? form
        : { name: form.name, companyCode: form.companyCode, fiscalYearStart: form.fiscalYearStart };
      await profileApi.updateCore(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const protectedFieldsForModal: ProtectedField[] = PROTECTED_FIELD_DEFS.map((f) => ({
    key: f.key as ProtectedField['key'],
    label: f.label,
    currentValue: (form[f.key] as string) ?? '',
  }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const renderField = (key: keyof FormState, label: string, placeholder: string, isProtected: boolean) => {
    const locked = isProtected && !canEditProtectedFields;
    return (
      <Field label={label} locked={locked}>
        {key === 'companyType' ? (
          <select
            value={(form.companyType as string) ?? ''}
            onChange={(e) => set('companyType', e.target.value)}
            disabled={locked}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">— Select type —</option>
            {COMPANY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        ) : (
          <Input
            value={(form[key] as string) ?? ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
            disabled={locked}
            className={locked ? 'opacity-60 cursor-not-allowed' : ''}
          />
        )}
      </Field>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Business Identity */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Business Identity</h2>
            {!canEditProtectedFields && (
              <Button size="sm" variant="outline" onClick={() => setShowRequestModal(true)}>
                <Lock className="mr-1.5 h-3.5 w-3.5" /> Request Change
              </Button>
            )}
          </div>

          <Field label="Company Name *">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Corp" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {renderField('legalName', 'Legal Business Name', 'Acme Corporation Pvt Ltd', true)}
            {renderField('tradeName', 'Trade Name', 'Acme', true)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Code">
              <Input value={form.companyCode ?? ''} onChange={(e) => set('companyCode', e.target.value)} placeholder="ACME001" />
            </Field>
            {renderField('companyType', 'Company Type', '', true)}
          </div>
        </CardContent>
      </Card>

      {/* Registration & Tax */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Registration &amp; Tax Numbers</h2>

          <div className="grid grid-cols-2 gap-4">
            {renderField('registrationNumber', 'Registration Number', 'U12345MH2020PTC123456', true)}
            {renderField('gstin', 'GST / VAT Number', '27AABCU9603R1ZX', true)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderField('panNumber', 'PAN / TIN Number', 'AABCU9603R', true)}
            {renderField('cinNumber', 'CIN / Business License', 'U12345MH2020PTC123456', true)}
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Year */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Fiscal Year</h2>
          <Field label="Fiscal Year Starts In" className="max-w-xs">
            <select
              value={form.fiscalYearStart}
              onChange={(e) => setForm((f) => ({ ...f, fiscalYearStart: parseInt(e.target.value, 10) }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FISCAL_MONTHS.map((m) => (
                <option key={m.value} value={m.value.toString()}>{m.label}</option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      {/* My Change Requests */}
      {!canEditProtectedFields && myRequests.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2"><Clock3 className="h-4 w-4" /> My Change Requests</h2>
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-foreground">{Object.keys(r.changes).join(', ')}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    r.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                      : r.status === 'rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        {saved  && <span className="text-sm text-emerald-600 font-medium">Saved successfully</span>}
        {error  && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {showRequestModal && (
        <RequestChangeModal
          fields={protectedFieldsForModal}
          open={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          onSubmitted={() => {
            setShowRequestModal(false);
            organizationChangeRequestApi.listMine().then(setMyRequests).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children, className, locked }: { label: string; children: React.ReactNode; className?: string; locked?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        {label}
        {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
      </label>
      {children}
    </div>
  );
}
