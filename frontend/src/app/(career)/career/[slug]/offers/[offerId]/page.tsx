'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { careerPortalApi } from '@/lib/career-portal-api';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (<div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value ?? '—'}</p></div>);
}

export default function CareerOfferPage() {
  const { slug, offerId } = useParams<{ slug: string; offerId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ offer: any; negotiations: any[] } | null>(null);
  const [acting, setActing] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [negotiateNote, setNegotiateNote] = useState('');
  const [showNegotiate, setShowNegotiate] = useState(false);

  const load = async (e: string) => {
    if (!e.trim()) { setError('Enter the email the offer was sent to'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await careerPortalApi.getOffer(slug, offerId, e.trim());
      setData(result);
    } catch {
      setError('No offer found for that email.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (email) load(email); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    setActing(true);
    try { await careerPortalApi.acceptOffer(slug, offerId, email); await load(email); } finally { setActing(false); }
  };

  const decline = async () => {
    setActing(true);
    try { await careerPortalApi.declineOffer(slug, offerId, email, declineReason || undefined); setShowDecline(false); await load(email); } finally { setActing(false); }
  };

  const negotiate = async () => {
    if (!negotiateNote.trim()) return;
    setActing(true);
    try { await careerPortalApi.negotiateOffer(slug, offerId, email, { note: negotiateNote }); setNegotiateNote(''); setShowNegotiate(false); await load(email); } finally { setActing(false); }
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-lg font-bold text-center">View Your Offer</h1>
          <input
            value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="Email the offer was sent to"
            onKeyDown={(ev) => { if (ev.key === 'Enter') load(email); }}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-xs text-red-600 text-center">{error}</p>}
          <button onClick={() => load(email)} disabled={loading} className="w-full bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} View Offer
          </button>
        </div>
      </div>
    );
  }

  const { offer, negotiations } = data;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Your Offer — {offer.designation || offer.job_title}</h1>
          <p className="text-sm text-muted-foreground capitalize mt-1">Status: {offer.status}</p>
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Designation" value={offer.designation} />
            <Field label="Joining Date" value={offer.joining_date ? new Date(offer.joining_date).toLocaleDateString() : null} />
            <Field label="CTC" value={offer.ctc ? `${offer.currency} ${offer.ctc}` : null} />
            <Field label="Expires" value={offer.expires_at ? new Date(offer.expires_at).toLocaleDateString() : 'No expiry set'} />
          </div>
          {!!offer.salary_components?.length && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Salary Components</p>
              <div className="space-y-1">
                {offer.salary_components.map((c: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm"><span>{c.name}</span><span className="font-medium">{offer.currency} {c.amount} {c.frequency ? `/ ${c.frequency}` : ''}</span></div>
                ))}
              </div>
            </div>
          )}
          {!!offer.benefits?.length && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Benefits</p>
              <div className="flex flex-wrap gap-1.5">{offer.benefits.map((b: string, i: number) => <span key={i} className="px-2 py-0.5 bg-muted/60 rounded-full text-xs">{b}</span>)}</div>
            </div>
          )}
          {offer.offer_letter_content && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Offer Letter</p>
              <p className="text-sm whitespace-pre-wrap">{offer.offer_letter_content}</p>
            </div>
          )}
        </div>

        {!!negotiations.length && (
          <div className="bg-muted/30 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Negotiation Thread</p>
            {negotiations.map((n: any) => (
              <div key={n.id} className="text-sm">
                <p><span className="font-medium capitalize">{n.raised_by}:</span> {n.note}</p>
                {(n.proposed_ctc || n.proposed_joining_date) && (
                  <p className="text-xs text-muted-foreground">{n.proposed_ctc ? `Proposed CTC: ${offer.currency} ${n.proposed_ctc}` : ''} {n.proposed_joining_date ? `• Proposed joining: ${new Date(n.proposed_joining_date).toLocaleDateString()}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {offer.status === 'sent' && (
          <div className="space-y-3">
            {showDecline && (
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Reason (optional)" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
                <button onClick={decline} disabled={acting} className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50">Confirm Decline</button>
              </div>
            )}
            {showNegotiate && (
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <textarea value={negotiateNote} onChange={(e) => setNegotiateNote(e.target.value)} placeholder="What would you like to discuss?" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
                <button onClick={negotiate} disabled={acting || !negotiateNote.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Send</button>
              </div>
            )}
            <div className="flex items-center gap-2 justify-center">
              <button onClick={accept} disabled={acting} className="flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4" /> Accept Offer
              </button>
              <button onClick={() => setShowNegotiate((v) => !v)} className="flex items-center gap-1.5 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
                <MessageSquare className="w-4 h-4" /> Propose Changes
              </button>
              <button onClick={() => setShowDecline((v) => !v)} className="flex items-center gap-1.5 border border-red-200 text-red-600 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-red-50">
                <XCircle className="w-4 h-4" /> Decline
              </button>
            </div>
          </div>
        )}
        {offer.status === 'accepted' && (
          <div className="text-center space-y-3">
            <p className="text-sm text-emerald-700 font-medium">You've accepted this offer. We'll be in touch about next steps!</p>
            <button
              onClick={() => router.push(`/career/${slug}/applications/${offer.application_id}/preboarding?email=${encodeURIComponent(email)}`)}
              className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90"
            >
              Complete Preboarding
            </button>
          </div>
        )}
        {offer.status === 'declined' && <p className="text-center text-sm text-muted-foreground">You've declined this offer.</p>}
      </div>
    </div>
  );
}
