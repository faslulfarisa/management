'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  ArrowLeft, Loader2, Pencil, Send, CheckCircle2, XCircle, Mail, Ban, History as HistoryIcon,
} from 'lucide-react';
import { offersApi, Offer, OfferVersion, OfferNegotiation } from '@/lib/offers-api';
import { applicationsApi, CandidateVerification, VerificationType } from '@/lib/candidates-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { OfferDrawer } from '@/components/recruitment/offer-drawer';
import { VacancyActionDialog } from '@/components/recruitment/vacancy-action-dialog';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';

type DialogKind = 'approve' | 'reject' | 'withdraw' | null;

const VERIFICATION_TYPES: VerificationType[] = ['reference', 'employment', 'education', 'identity', 'address', 'background'];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (<div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm text-foreground font-medium">{value ?? '—'}</p></div>);
}

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [versions, setVersions] = useState<OfferVersion[]>([]);
  const [negotiations, setNegotiations] = useState<OfferNegotiation[]>([]);
  const [verifications, setVerifications] = useState<CandidateVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const o = await offersApi.get(id);
    const [v, n, ver] = await Promise.all([
      offersApi.listVersions(id), offersApi.negotiations.list(id), applicationsApi.verifications.list(o.application_id),
    ]);
    setOffer(o); setVersions(v); setNegotiations(n); setVerifications(ver);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => { setBusy(true); try { await offersApi.submit(id); await load(); } finally { setBusy(false); } };
  const send = async () => { setBusy(true); try { await offersApi.send(id); await load(); } finally { setBusy(false); } };
  const restoreVersion = async (versionNumber: number) => { setBusy(true); try { await offersApi.restoreVersion(id, versionNumber); await load(); } finally { setBusy(false); } };

  if (loading || !offer) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const canEdit = ['draft', 'rejected'].includes(offer.status);
  const canSubmit = canEdit;
  const canApprove = offer.status === 'pending_approval';
  const canSend = offer.status === 'approved';
  const canWithdraw = ['approved', 'sent'].includes(offer.status);

  return (
    <div className="space-y-6">
      {showEdit && <OfferDrawer offer={offer} onClose={() => setShowEdit(false)} onSaved={load} />}
      {dialog === 'approve' && (
        <VacancyActionDialog
          title="Approve Offer" reasonRequired confirmLabel="Approve"
          confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onConfirm={async (reason) => { await offersApi.approve(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && (
        <VacancyActionDialog
          title="Reject Offer" reasonRequired confirmLabel="Reject"
          confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          onConfirm={async (reason) => { await offersApi.reject(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'withdraw' && (
        <VacancyActionDialog
          title="Withdraw Offer" reasonLabel="Reason (optional)" confirmLabel="Withdraw"
          onConfirm={async (reason) => { await offersApi.withdraw(id, reason || undefined); load(); }}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/offers')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{offer.first_name} {offer.last_name} — {offer.designation || offer.job_title}</h1>
              <span className="px-2 py-1 rounded-full text-xs font-medium capitalize bg-muted/60">{offer.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{offer.candidate_email} • {offer.vacancy_title || offer.job_title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            {canEdit && <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            {canSubmit && <button onClick={submit} disabled={busy} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit for Approval</button>}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_APPROVE}>
            {canApprove && (
              <>
                <button onClick={() => setDialog('approve')} className="flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                <button onClick={() => setDialog('reject')} className="flex items-center gap-1.5 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-red-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
              </>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            {canSend && <button onClick={send} disabled={busy} className="flex items-center gap-1.5 bg-violet-600 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"><Mail className="w-3.5 h-3.5" /> Send to Candidate</button>}
            {canWithdraw && <button onClick={() => setDialog('withdraw')} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"><Ban className="w-3.5 h-3.5" /> Withdraw</button>}
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Designation" value={offer.designation} />
              <Field label="Employment Type" value={offer.employment_type_name} />
              <Field label="Joining Date" value={offer.joining_date ? new Date(offer.joining_date).toLocaleDateString() : null} />
              <Field label="CTC" value={offer.ctc ? `${offer.currency} ${offer.ctc}` : null} />
              <Field label="Sent" value={offer.sent_at ? formatDistanceToNow(parseISO(offer.sent_at), { addSuffix: true }) : null} />
              <Field label="Expires" value={offer.expires_at ? new Date(offer.expires_at).toLocaleDateString() : null} />
              {offer.rejection_reason && <Field label="Rejection Reason" value={offer.rejection_reason} />}
              {offer.decline_reason && <Field label="Decline Reason" value={offer.decline_reason} />}
              {!!offer.salary_components?.length && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Salary Components</p>
                  {offer.salary_components.map((c, i) => <p key={i} className="text-sm">{c.name}: {offer.currency} {c.amount} {c.frequency ? `/ ${c.frequency}` : ''}</p>)}
                </div>
              )}
              {!!offer.benefits?.length && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Benefits</p>
                  <div className="flex flex-wrap gap-1.5">{offer.benefits.map((b, i) => <span key={i} className="px-2 py-0.5 bg-muted/60 rounded-full text-xs">{b}</span>)}</div>
                </div>
              )}
              {offer.offer_letter_content && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Offer Letter</p>
                  <p className="text-sm whitespace-pre-wrap">{offer.offer_letter_content}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <VerificationSection applicationId={offer.application_id} verifications={verifications} onSaved={load} />
          <NegotiationSection offerId={offer.id} negotiations={negotiations} currency={offer.currency} onSaved={load} />

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><HistoryIcon className="w-3.5 h-3.5" /> Version History</h3>
              <div className="space-y-2">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between bg-muted/30 rounded-xl p-2.5">
                    <div>
                      <p className="text-sm font-medium">v{v.version_number} {v.change_note ? `— ${v.change_note}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{v.created_by_email} • {formatDistanceToNow(parseISO(v.created_at), { addSuffix: true })}</p>
                    </div>
                    {canEdit && v.version_number !== offer.current_version && (
                      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                        <button onClick={() => restoreVersion(v.version_number)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted">Restore</button>
                      </Can>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {offer.approval_status !== 'not_required' && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Approval Timeline</h3>
                <ApprovalTimeline
                  request={{ approval_log: offer.approval_log, current_step: offer.approval_step, total_steps: null, status: offer.approval_status } as any}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function VerificationSection({ applicationId, verifications, onSaved }: { applicationId: string; verifications: CandidateVerification[]; onSaved: () => void }) {
  const [editingType, setEditingType] = useState<VerificationType | null>(null);
  const [form, setForm] = useState({ status: 'pending', comments: '' });
  const [saving, setSaving] = useState(false);

  const startEdit = (type: VerificationType) => {
    const existing = verifications.find((v) => v.verification_type === type);
    setForm({ status: existing?.status || 'pending', comments: existing?.comments || '' });
    setEditingType(type);
  };

  const save = async () => {
    if (!editingType) return;
    setSaving(true);
    try {
      await applicationsApi.verifications.upsert(applicationId, { verification_type: editingType, status: form.status, comments: form.comments || undefined });
      setEditingType(null);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Verification Checklist</h3>
        <div className="space-y-2">
          {VERIFICATION_TYPES.map((type) => {
            const v = verifications.find((x) => x.verification_type === type);
            return (
              <div key={type} className="bg-muted/30 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">{type}</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${v?.status === 'verified' ? 'bg-emerald-50 text-emerald-700' : v?.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{v?.status?.replace('_', ' ') || 'pending'}</span>
                    <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                      <button onClick={() => startEdit(type)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted">Update</button>
                    </Can>
                  </div>
                </div>
                {v?.comments && <p className="text-xs text-muted-foreground mt-1">{v.comments}</p>}
                {editingType === type && (
                  <div className="mt-2 space-y-2">
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm capitalize">
                      {['pending', 'in_progress', 'verified', 'failed', 'not_applicable'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Comments" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
                    <div className="flex gap-2">
                      <button onClick={save} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditingType(null)} className="border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function NegotiationSection({ offerId, negotiations, currency, onSaved }: { offerId: string; negotiations: OfferNegotiation[]; currency: string; onSaved: () => void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try { await offersApi.negotiations.add(offerId, { note }); setNote(''); onSaved(); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Negotiation</h3>
        {negotiations.length === 0 ? <p className="text-xs text-muted-foreground mb-3">No negotiation notes yet.</p> : (
          <div className="space-y-2 mb-3">
            {negotiations.map((n) => (
              <div key={n.id} className="bg-muted/30 rounded-xl p-3">
                <p className="text-sm"><span className="font-medium capitalize">{n.raised_by}:</span> {n.note}</p>
                {(n.proposed_ctc || n.proposed_joining_date) && (
                  <p className="text-xs text-muted-foreground mt-1">{n.proposed_ctc ? `Proposed CTC: ${currency} ${n.proposed_ctc}` : ''} {n.proposed_joining_date ? `• Proposed joining: ${new Date(n.proposed_joining_date).toLocaleDateString()}` : ''}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{n.created_by_email || 'Candidate'} • {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}</p>
              </div>
            ))}
          </div>
        )}
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 border border-border rounded-lg px-2.5 py-2 text-sm" />
            <button onClick={add} disabled={saving || !note.trim()} className="bg-primary text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Add</button>
          </div>
        </Can>
      </CardContent>
    </Card>
  );
}
