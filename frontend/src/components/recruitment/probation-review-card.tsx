'use client';

import { useState } from 'react';
import { Loader2, Plus, Send, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { probationApi, ProbationReview, ProbationRecommendation } from '@/lib/onboarding-api';
import { VacancyActionDialog } from './vacancy-action-dialog';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';

type DialogKind = 'approve' | 'reject' | null;

export function ProbationReviewCard({
  employeeId, applicationId, review, onSaved,
}: {
  employeeId: string;
  applicationId?: string | null;
  review: ProbationReview | null;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [goalText, setGoalText] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [entryText, setEntryText] = useState('');
  const [entryType, setEntryType] = useState<'manager' | 'hr'>('manager');
  const [recommendation, setRecommendation] = useState<ProbationRecommendation | ''>('');
  const [extendedDate, setExtendedDate] = useState('');
  const [notes, setNotes] = useState('');

  const startReview = async () => {
    setBusy(true);
    try { await probationApi.create({ employee_id: employeeId, application_id: applicationId ?? undefined }); onSaved(); } finally { setBusy(false); }
  };

  if (!review) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Probation & Confirmation</h3>
            <p className="text-xs text-muted-foreground mt-0.5">No probation review started yet.</p>
          </div>
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            <button onClick={startReview} disabled={busy} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />} Start Probation Review
            </button>
          </Can>
        </CardContent>
      </Card>
    );
  }

  const canEdit = ['draft', 'rejected'].includes(review.status);
  const canSubmit = canEdit && !!review.recommendation;
  const canApprove = review.status === 'pending_approval';

  const addGoal = async () => {
    if (!goalText.trim()) return;
    setBusy(true);
    try { await probationApi.addGoal(review.id, { description: goalText, target_date: goalDate || undefined }); setGoalText(''); setGoalDate(''); onSaved(); } finally { setBusy(false); }
  };

  const addEntry = async () => {
    if (!entryText.trim()) return;
    setBusy(true);
    try { await probationApi.addReviewEntry(review.id, { type: entryType, feedback: entryText }); setEntryText(''); onSaved(); } finally { setBusy(false); }
  };

  const saveRecommendation = async () => {
    if (!recommendation) return;
    setBusy(true);
    try {
      await probationApi.setRecommendation(review.id, {
        recommendation, recommendation_notes: notes || undefined,
        extended_probation_end_date: recommendation === 'extend' ? extendedDate || undefined : undefined,
      });
      onSaved();
    } finally { setBusy(false); }
  };

  const submit = async () => { setBusy(true); try { await probationApi.submit(review.id); onSaved(); } finally { setBusy(false); } };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {dialog === 'approve' && (
          <VacancyActionDialog
            title="Approve Probation Review" reasonRequired confirmLabel="Approve"
            confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            onConfirm={async (reason) => { await probationApi.approve(review.id, reason); onSaved(); }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog === 'reject' && (
          <VacancyActionDialog
            title="Reject Probation Review" reasonRequired confirmLabel="Reject"
            confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            onConfirm={async (reason) => { await probationApi.reject(review.id, reason); onSaved(); }}
            onClose={() => setDialog(null)}
          />
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Probation & Confirmation</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-muted/60">{review.status.replace('_', ' ')}</span>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Goals</p>
          <div className="space-y-1.5">
            {review.goals.length === 0 && <p className="text-xs text-muted-foreground">No goals set yet.</p>}
            {review.goals.map((g, i) => (
              <div key={i} className="bg-muted/30 rounded-lg px-3 py-1.5 text-sm flex justify-between">
                <span>{g.description}</span>
                {g.target_date && <span className="text-xs text-muted-foreground">{new Date(g.target_date).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
          {canEdit && (
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              <div className="flex gap-2 mt-2">
                <input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Goal description" className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-sm" />
                <input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} className="border border-border rounded-lg px-2.5 py-1.5 text-sm" />
                <button onClick={addGoal} disabled={busy || !goalText.trim()} className="border border-border rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </Can>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Review Entries</p>
          <div className="space-y-1.5">
            {review.review_entries.length === 0 && <p className="text-xs text-muted-foreground">No review feedback yet.</p>}
            {review.review_entries.map((entry, i) => (
              <div key={i} className="bg-muted/30 rounded-lg px-3 py-1.5">
                <p className="text-sm"><span className="font-medium capitalize">{entry.type}:</span> {entry.feedback}</p>
                <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
          {canEdit && (
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              <div className="flex gap-2 mt-2">
                <select value={entryType} onChange={(e) => setEntryType(e.target.value as 'manager' | 'hr')} className="border border-border rounded-lg px-2 py-1.5 text-sm capitalize">
                  <option value="manager">Manager</option>
                  <option value="hr">HR</option>
                </select>
                <input value={entryText} onChange={(e) => setEntryText(e.target.value)} placeholder="Feedback" className="flex-1 border border-border rounded-lg px-2.5 py-1.5 text-sm" />
                <button onClick={addEntry} disabled={busy || !entryText.trim()} className="border border-border rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </Can>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Recommendation</p>
          {review.recommendation ? (
            <p className="text-sm capitalize">{review.recommendation} {review.recommendation_notes ? `— ${review.recommendation_notes}` : ''}</p>
          ) : <p className="text-xs text-muted-foreground">Not set yet.</p>}
          {canEdit && (
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              <div className="space-y-2 mt-2">
                <select value={recommendation} onChange={(e) => setRecommendation(e.target.value as ProbationRecommendation)} className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm capitalize">
                  <option value="">Select recommendation…</option>
                  <option value="confirm">Confirm</option>
                  <option value="extend">Extend Probation</option>
                  <option value="terminate">Terminate</option>
                </select>
                {recommendation === 'extend' && (
                  <input type="date" value={extendedDate} onChange={(e) => setExtendedDate(e.target.value)} className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm" />
                )}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm resize-none" />
                <button onClick={saveRecommendation} disabled={busy || !recommendation} className="border border-border rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Save Recommendation</button>
              </div>
            </Can>
          )}
        </div>

        {review.confirmation_letter_content && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Confirmation Letter</p>
            <p className="text-sm whitespace-pre-wrap">{review.confirmation_letter_content}</p>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            {canSubmit && (
              <button onClick={submit} disabled={busy} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit for Approval
              </button>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_APPROVE}>
            {canApprove && (
              <>
                <button onClick={() => setDialog('approve')} className="flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</button>
                <button onClick={() => setDialog('reject')} className="flex items-center gap-1.5 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-red-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
              </>
            )}
          </Can>
        </div>

        {review.approval_status !== 'not_required' && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Approval Timeline</p>
            <ApprovalTimeline
              request={{ approval_log: review.approval_log, current_step: review.approval_step, total_steps: null, status: review.approval_status } as any}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
