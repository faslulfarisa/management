'use client';

import { useState, useEffect } from 'react';
import { profileApi } from '@/lib/company-profile-api';
import type { AddressPayload } from '@/lib/company-profile-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RefreshCw, Copy } from 'lucide-react';

const EMPTY_ADDR: AddressPayload = {
  line1: '', line2: '', city: '', state: '', country: '', postal_code: '',
};

export default function AddressesPage() {
  const [registered,   setRegistered]   = useState<AddressPayload>(EMPTY_ADDR);
  const [operational,  setOperational]  = useState<AddressPayload>(EMPTY_ADDR);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    profileApi.get().then((p) => {
      setRegistered({ ...EMPTY_ADDR,  ...(p.registered_address  ?? {}) });
      setOperational({ ...EMPTY_ADDR, ...(p.operational_address ?? {}) });
    }).catch(() => setError('Failed to load profile.')).finally(() => setLoading(false));
  }, []);

  const setReg = (key: keyof AddressPayload, val: string) =>
    setRegistered((a) => ({ ...a, [key]: val }));

  const setOp = (key: keyof AddressPayload, val: string) =>
    setOperational((a) => ({ ...a, [key]: val }));

  const copyRegistered = () => setOperational({ ...registered });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await profileApi.updateAddresses({
        registeredAddress:  registered,
        operationalAddress: operational,
      });
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
    <div className="space-y-6 max-w-3xl">
      <AddressCard
        title="Registered Address"
        subtitle="Legal registration address as per government records"
        addr={registered}
        onChange={setReg}
      />

      <AddressCard
        title="Operational Address"
        subtitle="Day-to-day business address"
        addr={operational}
        onChange={setOp}
        extra={
          <Button variant="outline" size="sm" onClick={copyRegistered} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy from registered
          </Button>
        }
      />

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

function AddressCard({
  title, subtitle, addr, onChange, extra,
}: {
  title: string;
  subtitle: string;
  addr: AddressPayload;
  onChange: (key: keyof AddressPayload, val: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          {extra}
        </div>

        <Field label="Address Line 1">
          <Input value={addr.line1 ?? ''} onChange={(e) => onChange('line1', e.target.value)} placeholder="Building / Street" />
        </Field>
        <Field label="Address Line 2">
          <Input value={addr.line2 ?? ''} onChange={(e) => onChange('line2', e.target.value)} placeholder="Area / Locality (optional)" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <Input value={addr.city ?? ''} onChange={(e) => onChange('city', e.target.value)} placeholder="Mumbai" />
          </Field>
          <Field label="State / Province">
            <Input value={addr.state ?? ''} onChange={(e) => onChange('state', e.target.value)} placeholder="Maharashtra" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Country">
            <Input value={addr.country ?? ''} onChange={(e) => onChange('country', e.target.value)} placeholder="India" />
          </Field>
          <Field label="Postal Code">
            <Input value={addr.postal_code ?? ''} onChange={(e) => onChange('postal_code', e.target.value)} placeholder="400001" />
          </Field>
        </div>
      </CardContent>
    </Card>
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
