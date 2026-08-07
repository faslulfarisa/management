'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil, Send, CheckCircle2, XCircle, StopCircle } from 'lucide-react';
import { workforcePlansApi, WorkforcePlan } from '@/lib/workforce-plans-api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { WorkforcePlanDrawer } from '@/components/recruitment/workforce-plan-drawer';
import { VacancyActionDialog } from '@/components/recruitment/vacancy-action-dialog';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';

type DialogKind = 'approve' | 'reject' | null;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  active: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function WorkforcePlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<WorkforcePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    workforcePlansApi.get(id).then(setPlan).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const submitForApproval = async () => {
    setSubmitting(true);
    try { await workforcePlansApi.submit(id); load(); } finally { setSubmitting(false); }
  };

  const closePlan = async () => {
    setSubmitting(true);
    try { await workforcePlansApi.close(id); load(); } finally { setSubmitting(false); }
  };

  if (loading || !plan) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const canEdit = ['draft', 'rejected'].includes(plan.status);
  const canSubmit = ['draft', 'rejected'].includes(plan.status);
  const canApprove = plan.status === 'pending_approval';
  const canClose = plan.status === 'active';

  return (
    <div className="space-y-6">
      {showEdit && <WorkforcePlanDrawer plan={plan} onClose={() => setShowEdit(false)} onSaved={load} />}
      {dialog === 'approve' && (
        <VacancyActionDialog
          title="Approve Workforce Plan" reasonRequired confirmLabel="Approve"
          confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onConfirm={async (reason) => { await workforcePlansApi.approve(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && (
        <VacancyActionDialog
          title="Reject Workforce Plan" reasonRequired confirmLabel="Reject"
          confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          onConfirm={async (reason) => { await workforcePlansApi.reject(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/workforce-planning')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{plan.title}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[plan.status] || 'bg-gray-100'}`}>{plan.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{plan.branch_name || 'Org-wide'} • {plan.year}</p>
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
              <button onClick={closePlan} disabled={submitting} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                <StopCircle className="w-3.5 h-3.5" /> Close
              </button>
            )}
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><p className="text-xs text-muted-foreground">Budgeted Headcount</p><p className="text-lg font-bold">{plan.total_budgeted_headcount ?? 0}</p></div>
                <div><p className="text-xs text-muted-foreground">Planned Hires</p><p className="text-lg font-bold">{plan.total_planned_hires ?? 0}</p></div>
                <div><p className="text-xs text-muted-foreground">Total Budget</p><p className="text-lg font-bold">{plan.total_budget_amount?.toLocaleString() ?? 0}</p></div>
              </div>
              {plan.notes && <p className="text-sm text-muted-foreground border-t border-border pt-3">{plan.notes}</p>}
              {plan.rejection_reason && <p className="text-sm text-red-600 border-t border-border pt-3 mt-2">Rejection reason: {plan.rejection_reason}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Department / Position Breakdown</h3>
              {plan.breakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground">No breakdown rows.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Current HC</TableHead>
                      <TableHead>Budgeted HC</TableHead>
                      <TableHead>Planned Hires</TableHead>
                      <TableHead>Budget</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.breakdown.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{(row as any).department_name || row.department_id || '—'}</TableCell>
                        <TableCell>{(row as any).position_name || row.position_id || '—'}</TableCell>
                        <TableCell>{row.current_headcount ?? 0}</TableCell>
                        <TableCell>{row.budgeted_headcount ?? 0}</TableCell>
                        <TableCell>{row.planned_hires ?? 0}</TableCell>
                        <TableCell>{row.budget_amount?.toLocaleString() ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {plan.approval_status !== 'not_required' && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Approval Timeline</h3>
                <ApprovalTimeline
                  request={{
                    approval_log: plan.approval_log,
                    current_step: plan.approval_step,
                    total_steps: null,
                    status: plan.approval_status,
                  } as any}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
