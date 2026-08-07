'use client';

import { useState, useEffect } from 'react';
import { profileApi } from '@/lib/company-profile-api';
import type { UpdateContactInfoPayload } from '@/lib/company-profile-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RefreshCw } from 'lucide-react';

const EMPTY: UpdateContactInfoPayload = {
  primaryEmail: '',
  supportEmail: '',
  phoneNumber: '',
  alternatePhone: '',
  websiteUrl: '',
  contactPersonName: '',
  contactDesignation: '',
  contactPersonMobile: '',
  contactPersonEmail: '',
};

export default function ContactPage() {
  const [form, setForm] = useState<UpdateContactInfoPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    profileApi.get().then((p) => {
      setForm({
        primaryEmail:  p.primary_email  ?? '',
        supportEmail:  p.support_email  ?? '',
        phoneNumber:   p.phone_number   ?? '',
        alternatePhone: p.alternate_phone ?? '',
        websiteUrl:    p.website_url    ?? '',
        contactPersonName: p.contact_person_name ?? '',
        contactDesignation: p.contact_designation ?? '',
        contactPersonMobile: p.contact_person_mobile ?? '',
        contactPersonEmail: p.contact_person_email ?? '',
      });
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));
  }, []);

  const set = (key: keyof UpdateContactInfoPayload, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await profileApi.updateContact(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Email Addresses</h2>

          <Field label="Primary Email">
            <Input
              type="email"
              value={form.primaryEmail ?? ''}
              onChange={(e) => set('primaryEmail', e.target.value)}
              placeholder="hello@company.com"
            />
          </Field>
          <Field label="Support Email">
            <Input
              type="email"
              value={form.supportEmail ?? ''}
              onChange={(e) => set('supportEmail', e.target.value)}
              placeholder="support@company.com"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Phone Numbers</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary Phone">
              <Input
                type="tel"
                value={form.phoneNumber ?? ''}
                onChange={(e) => set('phoneNumber', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field label="Alternate Phone">
              <Input
                type="tel"
                value={form.alternatePhone ?? ''}
                onChange={(e) => set('alternatePhone', e.target.value)}
                placeholder="+91 98765 43211"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Primary Contact</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact Person Name">
              <Input
                value={form.contactPersonName ?? ''}
                onChange={(e) => set('contactPersonName', e.target.value)}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Designation">
              <Input
                value={form.contactDesignation ?? ''}
                onChange={(e) => set('contactDesignation', e.target.value)}
                placeholder="HR Manager"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mobile Number">
              <Input
                type="tel"
                value={form.contactPersonMobile ?? ''}
                onChange={(e) => set('contactPersonMobile', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.contactPersonEmail ?? ''}
                onChange={(e) => set('contactPersonEmail', e.target.value)}
                placeholder="contact@company.com"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Website</h2>
          <Field label="Website URL">
            <Input
              type="url"
              value={form.websiteUrl ?? ''}
              onChange={(e) => set('websiteUrl', e.target.value)}
              placeholder="https://www.company.com"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved successfully</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
