'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, Circle, MinusCircle, Upload } from 'lucide-react';
import { careerPortalApi } from '@/lib/career-portal-api';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';

const STATUS_ICON: Record<string, any> = { completed: CheckCircle2, pending: Circle, not_applicable: MinusCircle };
const STATUS_COLOR: Record<string, string> = { completed: 'text-emerald-600', pending: 'text-muted-foreground', not_applicable: 'text-gray-400' };

export default function CareerPreboardingPage() {
  const { slug, applicationId } = useParams<{ slug: string; applicationId: string }>();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checklist, setChecklist] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [bank, setBank] = useState({ bank_name: '', bank_account_number: '', ifsc_code: '', account_type: '', upi_id: '' });
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '', address: '' });
  const [ndaChecked, setNdaChecked] = useState(false);

  const load = async (e: string) => {
    if (!e.trim()) { setError('Enter the email you applied with'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await careerPortalApi.getPreboarding(slug, applicationId, e.trim());
      setChecklist(data);
      setBank({ ...bank, ...(data.bank_details || {}) });
      setContact({ ...contact, ...(data.emergency_contact || {}) });
    } catch {
      setError('No preboarding checklist found for that email.');
      setChecklist(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (email) load(email); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveBank = async () => {
    setSaving(true);
    try { await careerPortalApi.submitBankDetails(slug, applicationId, email, bank); await load(email); } finally { setSaving(false); }
  };

  const saveContact = async () => {
    setSaving(true);
    try { await careerPortalApi.submitEmergencyContact(slug, applicationId, email, contact); await load(email); } finally { setSaving(false); }
  };

  const acceptNda = async () => {
    if (!ndaChecked) return;
    setSaving(true);
    try { await careerPortalApi.acceptNda(slug, applicationId, email); await load(email); } finally { setSaving(false); }
  };

  const uploadDoc = async (file: File) => {
    setSaving(true);
    try { await careerPortalApi.uploadPreboardingDocument(slug, applicationId, email, file); await load(email); } finally { setSaving(false); }
  };

  if (!checklist) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-lg font-bold text-center">Complete Your Preboarding</h1>
          <input
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email you applied with"
            onKeyDown={(e) => { if (e.key === 'Enter') load(email); }}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-red-600 text-center">{error}</p>}
          <button onClick={() => load(email)} disabled={loading} className="w-full bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} View Preboarding
          </button>
        </div>
      </div>
    );
  }

  const items: any[] = checklist.items || [];
  const itemStatus = (key: string) => items.find((i) => i.key === key)?.status || 'pending';
  const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Preboarding Checklist</h1>
          {checklist.joining_date && <p className="text-sm text-muted-foreground mt-1">Joining date: {new Date(checklist.joining_date).toLocaleDateString()}</p>}
        </div>

        <div className="bg-white border border-border rounded-2xl p-5 space-y-2 shadow-sm">
          {items.map((item) => {
            const Icon = STATUS_ICON[item.status] || Circle;
            return (
              <div key={item.key} className="flex items-center gap-2 py-1">
                <Icon className={`w-4 h-4 shrink-0 ${STATUS_COLOR[item.status]}`} />
                <span className="text-sm">{item.label}</span>
              </div>
            );
          })}
        </div>

        {itemStatus('bank_details') !== 'completed' ? (
          <div className="bg-white border border-border rounded-2xl p-5 space-y-2 shadow-sm">
            <p className="text-sm font-semibold">Bank Details</p>
            <input placeholder="Bank Name" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} className={inputCls} />
            <input placeholder="Account Number" value={bank.bank_account_number} onChange={(e) => setBank({ ...bank, bank_account_number: e.target.value })} className={inputCls} />
            <input placeholder="IFSC Code" value={bank.ifsc_code} onChange={(e) => setBank({ ...bank, ifsc_code: e.target.value })} className={inputCls} />
            <input placeholder="UPI ID (optional)" value={bank.upi_id} onChange={(e) => setBank({ ...bank, upi_id: e.target.value })} className={inputCls} />
            <button onClick={saveBank} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Save Bank Details</button>
          </div>
        ) : <p className="text-sm text-emerald-700 text-center">✓ Bank details submitted</p>}

        {itemStatus('emergency_contact') !== 'completed' ? (
          <div className="bg-white border border-border rounded-2xl p-5 space-y-2 shadow-sm">
            <p className="text-sm font-semibold">Emergency Contact</p>
            <input placeholder="Full Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={inputCls} />
            <input placeholder="Relationship" value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} className={inputCls} />
            <PhoneNumberInput value={contact.phone} onChange={(value) => setContact({ ...contact, phone: value })} placeholder="Phone" />
            <input placeholder="Address (optional)" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} className={inputCls} />
            <button onClick={saveContact} disabled={saving || !contact.name.trim() || !contact.phone.trim()} className="bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Save Emergency Contact</button>
          </div>
        ) : <p className="text-sm text-emerald-700 text-center">✓ Emergency contact submitted</p>}

        {itemStatus('document_collection') !== 'completed' && (
          <div className="bg-white border border-border rounded-2xl p-5 space-y-2 shadow-sm">
            <p className="text-sm font-semibold">Upload Onboarding Documents</p>
            <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-xl px-4 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30">
              <Upload className="w-4 h-4" /> Choose a file to upload
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); }} />
            </label>
          </div>
        )}

        {itemStatus('nda_policy_acceptance') !== 'completed' ? (
          <div className="bg-white border border-border rounded-2xl p-5 space-y-3 shadow-sm">
            <p className="text-sm font-semibold">NDA & Company Policies</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={ndaChecked} onChange={(e) => setNdaChecked(e.target.checked)} className="mt-0.5 rounded border-border" />
              I have read and accept the company's NDA and policies.
            </label>
            <button onClick={acceptNda} disabled={saving || !ndaChecked} className="bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Accept</button>
          </div>
        ) : <p className="text-sm text-emerald-700 text-center">✓ NDA & policies accepted</p>}

        {checklist.status === 'completed' && (
          <p className="text-center text-sm text-emerald-700 font-medium">You've completed preboarding. We'll see you on your joining date!</p>
        )}
      </div>
    </div>
  );
}
