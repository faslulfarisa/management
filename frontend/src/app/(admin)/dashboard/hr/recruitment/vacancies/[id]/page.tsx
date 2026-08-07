'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  ArrowLeft, Loader2, Pencil, Send, CheckCircle2, XCircle, PauseCircle, RotateCcw, Archive,
} from 'lucide-react';
import { vacanciesApi, Vacancy, VacancyStatusHistoryEntry, vacancyFullName } from '@/lib/vacancies-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { VacancyStatusBadge } from '@/components/recruitment/vacancy-status-badge';
import { VacancyDrawer } from '@/components/recruitment/vacancy-drawer';
import { VacancyActionDialog } from '@/components/recruitment/vacancy-action-dialog';
import { VacancyComments } from '@/components/recruitment/vacancy-comments';
import { VacancyAttachments } from '@/components/recruitment/vacancy-attachments';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';

type DialogKind = 'approve' | 'reject' | 'close' | 'reopen' | 'archive' | null;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground font-medium">{value ?? '—'}</p>
    </div>
  );
}

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [history, setHistory] = useState<VacancyStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    Promise.all([vacanciesApi.get(id), vacanciesApi.history(id)])
      .then(([v, h]) => { setVacancy(v); setHistory(h); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const submitForApproval = async () => {
    setSubmitting(true);
    try { await vacanciesApi.submit(id); load(); } finally { setSubmitting(false); }
  };

  if (loading || !vacancy) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const canEdit = ['draft', 'rejected'].includes(vacancy.status);
  const canSubmit = ['draft', 'rejected'].includes(vacancy.status);
  const canApprove = ['pending_approval'].includes(vacancy.status);
  const canClose = ['open', 'on_hold', 'reopened'].includes(vacancy.status);
  const canReopen = vacancy.status === 'closed';
  const canArchive = ['closed', 'rejected', 'cancelled'].includes(vacancy.status);

  const salaryRange = vacancy.salary_min || vacancy.salary_max
    ? `₹${vacancy.salary_min ?? '—'} – ₹${vacancy.salary_max ?? '—'}` : '—';
  const experienceRange = vacancy.experience_min_years || vacancy.experience_max_years
    ? `${vacancy.experience_min_years ?? '0'} – ${vacancy.experience_max_years ?? '—'} yrs` : '—';

  return (
    <div className="space-y-6">
      {showEdit && <VacancyDrawer vacancy={vacancy} onClose={() => setShowEdit(false)} onSaved={load} />}
      {dialog === 'approve' && (
        <VacancyActionDialog
          title="Approve Vacancy" reasonRequired confirmLabel="Approve"
          confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onConfirm={async (reason) => { await vacanciesApi.approve(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && (
        <VacancyActionDialog
          title="Reject Vacancy" reasonRequired confirmLabel="Reject"
          confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          onConfirm={async (reason) => { await vacanciesApi.reject(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'close' && (
        <VacancyActionDialog
          title="Close Vacancy" reasonLabel="Reason (optional)" confirmLabel="Close"
          onConfirm={async (reason) => { await vacanciesApi.close(id, reason || undefined); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reopen' && (
        <VacancyActionDialog
          title="Reopen Vacancy" reasonLabel="Reason (optional)" confirmLabel="Reopen"
          onConfirm={async (reason) => { await vacanciesApi.reopen(id, reason || undefined); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'archive' && (
        <VacancyActionDialog
          title="Archive Vacancy" reasonLabel="Reason (optional)" confirmLabel="Archive"
          onConfirm={async (reason) => { await vacanciesApi.archive(id, reason || undefined); load(); }}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/vacancies')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{vacancy.title}</h1>
              <VacancyStatusBadge status={vacancy.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {vacancy.department_name || 'No department'} • {vacancy.branch_name || 'No branch'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            {canEdit && (
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            {canSubmit && (
              <button onClick={submitForApproval} disabled={submitting} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit for Approval
              </button>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_APPROVE}>
            {canApprove && (
              <>
                <button onClick={() => setDialog('approve')} className="flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={() => setDialog('reject')} className="flex items-center gap-1.5 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-red-50">
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_CLOSE}>
            {canClose && (
              <button onClick={() => setDialog('close')} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
                <PauseCircle className="w-3.5 h-3.5" /> Close
              </button>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_REOPEN}>
            {canReopen && (
              <button onClick={() => setDialog('reopen')} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </button>
            )}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_ARCHIVE}>
            {canArchive && (
              <button onClick={() => setDialog('archive')} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Position" value={vacancy.position_name} />
              <Field label="Employment Type" value={vacancy.employment_type_name} />
              <Field label="Number of Positions" value={vacancy.number_of_positions} />
              <Field label="Hiring Manager" value={vacancyFullName('hiring_manager', vacancy)} />
              <Field label="Recruiter" value={vacancyFullName('recruiter', vacancy)} />
              <Field label="Reporting Manager" value={vacancyFullName('reporting_manager', vacancy)} />
              <Field label="Experience" value={experienceRange} />
              <Field label="Salary Range" value={salaryRange} />
              <Field label="Qualification" value={vacancy.qualification} />
              <Field label="Target Start" value={vacancy.target_start_date} />
              <Field label="Target Close" value={vacancy.target_close_date} />
              <Field label="Created By" value={vacancy.created_by_email} />
              {vacancy.rejection_reason && <Field label="Rejection Reason" value={vacancy.rejection_reason} />}
              {vacancy.close_reason && <Field label="Close Reason" value={vacancy.close_reason} />}
              {vacancy.description && <div className="col-span-full"><Field label="Description" value={vacancy.description} /></div>}
              {vacancy.justification && <div className="col-span-full"><Field label="Justification" value={vacancy.justification} /></div>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <VacancyComments vacancyId={vacancy.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <VacancyAttachments vacancyId={vacancy.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {vacancy.approval_status !== 'not_required' && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Approval Timeline</h3>
                <ApprovalTimeline
                  request={{
                    approval_log: vacancy.approval_log,
                    current_step: vacancy.approval_step,
                    total_steps: null,
                    status: vacancy.approval_status,
                  } as any}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">History</h3>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No status changes yet.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="text-sm">
                      <p className="text-foreground font-medium capitalize">
                        {h.from_status ? `${h.from_status.replace('_', ' ')} → ` : ''}{h.to_status.replace('_', ' ')}
                      </p>
                      {h.reason && <p className="text-xs text-muted-foreground">{h.reason}</p>}
                      <p className="text-xs text-muted-foreground">
                        {h.actor_email || 'System'} • {formatDistanceToNow(parseISO(h.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
