'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AddressFields from '@/components/forms/AddressFields';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';

export default function OrganizationPage() {
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', industry: '', contact_email: '', contact_phone: '',
    address: '', city: '', state: '', country: '', postal_code: '',
    website: '', timezone: '', currency: '',
  });

  const fetchOrg = async () => {
    try {
      const { data } = await api.get('/organization');
      setOrg(data.data);
      setForm({
        name: data.data?.name || '',
        slug: data.data?.slug || '',
        industry: data.data?.industry || '',
        contact_email: data.data?.contact_email || '',
        contact_phone: data.data?.contact_phone || '',
        address: data.data?.address || '',
        city: data.data?.city || '',
        state: data.data?.state || '',
        country: data.data?.country || '',
        postal_code: data.data?.postal_code || '',
        website: data.data?.website || '',
        timezone: data.data?.timezone || '',
        currency: data.data?.currency || '',
      });
    } catch (err) {
      console.error('Failed to fetch org:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrg(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { countryCode, stateCode, ...payload } = form as typeof form & { countryCode?: string; stateCode?: string };
      Object.keys(payload).forEach(key => { if (payload[key as keyof typeof payload] === '') delete payload[key as keyof typeof payload]; });
      await api.put('/organization', payload);
      setEditing(false);
      fetchOrg();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organization</h1>
          <p className="text-muted-foreground">Manage your hotel group profile</p>
        </div>
        {!editing ? (
          <Button onClick={() => setEditing(true)}>Edit</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setEditing(false); fetchOrg(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Company Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Company Name</label>
            {editing ? (
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            ) : <p className="py-2">{org?.name || '-'}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Slug</label>
            {editing ? (
              <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
            ) : <p className="py-2 font-mono text-sm">{org?.slug || '-'}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Industry</label>
            {editing ? (
              <select value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">Select</option>
                <option value="hotel">Hotel</option>
                <option value="resort">Resort</option>
                <option value="restaurant">Restaurant</option>
                <option value="banquet">Banquet</option>
              </select>
            ) : <p className="py-2 capitalize">{org?.industry || '-'}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Website</label>
            {editing ? (
              <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
            ) : <p className="py-2">{org?.website || '-'}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Contact Email</label>
            {editing ? (
              <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
            ) : <p className="py-2">{org?.contact_email || '-'}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Contact Phone</label>
            {editing ? (
              <PhoneNumberInput value={form.contact_phone} onChange={value => setForm({ ...form, contact_phone: value })} />
            ) : <p className="py-2">{org?.contact_phone || '-'}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Address</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <AddressFields
              value={{
                line1: form.address,
                city: form.city,
                state: form.state,
                country: form.country,
                postal_code: form.postal_code,
                countryCode: (form as any).countryCode || '',
                stateCode: (form as any).stateCode || '',
              }}
              onChange={(address) => setForm({
                ...form,
                address: address.line1 || '',
                city: address.city || '',
                state: address.state || '',
                country: address.country || '',
                postal_code: address.postal_code || '',
                ...(address.countryCode ? { countryCode: address.countryCode } : {}),
                ...(address.stateCode ? { stateCode: address.stateCode } : {}),
              } as any)}
              postalCodeKey="postal_code"
            />
          ) : (
            <p className="py-2">{[org?.address, org?.city, org?.state, org?.country, org?.postal_code].filter(Boolean).join(', ') || '-'}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Timezone</label>
            {editing ? (
              <Input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} />
            ) : <p className="py-2">{org?.timezone || '-'}</p>}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Currency</label>
            {editing ? (
              <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            ) : <p className="py-2">{org?.currency || '-'}</p>}
          </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
