'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, CheckCircle2, Copy, Loader2, Pencil, Send, XCircle, Archive, Rocket, Link as LinkIcon } from 'lucide-react';
import { jobDescriptionsApi, jobPostingsApi, JobDescription, JobDescriptionVersion, JobPosting } from '@/lib/job-descriptions-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { JobDescriptionDrawer } from '@/components/recruitment/job-description-drawer';
import { VacancyActionDialog } from '@/components/recruitment/vacancy-action-dialog';

type DialogKind = 'approve' | 'reject' | null;

function TagList({ items }: { items: string[] }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i, idx) => <span key={idx} className="px-2 py-0.5 bg-muted/60 rounded-full text-xs">{i}</span>)}
    </div>
  );
}

export default function JobDescriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [versions, setVersions] = useState<JobDescriptionVersion[]>([]);
  const [posting, setPosting] = useState<JobPosting | null>(null);
  const [shareInfo, setShareInfo] = useState<{ url: string; qrCodeDataUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [jdData, versionData] = await Promise.all([jobDescriptionsApi.get(id), jobDescriptionsApi.listVersions(id)]);
    setJd(jdData);
    setVersions(versionData);
    if (jdData.vacancy_id) {
      const postings = await jobPostingsApi.list({ vacancy_id: jdData.vacancy_id, job_description_id: jdData.id });
      setPosting(postings[0] || null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const submit = async () => { setBusy(true); try { await jobDescriptionsApi.submit(id); await load(); } finally { setBusy(false); } };
  const duplicate = async () => { const copy = await jobDescriptionsApi.duplicate(id); router.push(`/dashboard/hr/recruitment/job-descriptions/${copy.id}`); };
  const archive = async () => { setBusy(true); try { await jobDescriptionsApi.archive(id); await load(); } finally { setBusy(false); } };
  const restoreVersion = async (versionNumber: number) => { setBusy(true); try { await jobDescriptionsApi.restoreVersion(id, versionNumber); await load(); } finally { setBusy(false); } };

  const publish = async () => {
    if (!jd?.vacancy_id) return;
    setBusy(true);
    try {
      const result = await jobPostingsApi.publish(jd.vacancy_id, jd.id);
      setPosting(result);
      const info = await jobPostingsApi.share(result.id);
      setShareInfo(info);
    } finally { setBusy(false); }
  };
  const unpublish = async () => { if (!posting) return; setBusy(true); try { setPosting(await jobPostingsApi.unpublish(posting.id)); } finally { setBusy(false); } };
  const republish = async () => { if (!posting) return; setBusy(true); try { setPosting(await jobPostingsApi.republish(posting.id)); } finally { setBusy(false); } };
  const loadShare = async () => { if (!posting) return; setShareInfo(await jobPostingsApi.share(posting.id)); };

  if (loading || !jd) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const canEdit = ['draft', 'rejected'].includes(jd.status);
  const canSubmit = canEdit;
  const canApprove = jd.status === 'pending_approval';
  const canArchive = jd.status !== 'archived' && jd.status !== 'pending_approval';
  const canPublish = jd.status === 'approved' && !!jd.vacancy_id;

  return (
    <div className="space-y-6">
      {showEdit && <JobDescriptionDrawer jobDescription={jd} onClose={() => setShowEdit(false)} onSaved={load} />}
      {dialog === 'approve' && (
        <VacancyActionDialog
          title="Approve Job Description" reasonRequired confirmLabel="Approve"
          confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onConfirm={async (reason) => { await jobDescriptionsApi.approve(id, reason); await load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && (
        <VacancyActionDialog
          title="Reject Job Description" reasonRequired confirmLabel="Reject"
          confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          onConfirm={async (reason) => { await jobDescriptionsApi.reject(id, reason); await load(); }}
          onClose={() => setDialog(null)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/job-descriptions')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{jd.title}</h1>
            <p className="text-sm text-muted-foreground">
              {jd.vacancy_title ? `Linked to vacancy: ${jd.vacancy_title}` : 'Standalone / template'} • v{jd.current_version} • {jd.status.replace('_', ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            {canEdit && <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"><Pencil className="w-3.5 h-3.5" /> Edit</button>}
          </Can>
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            <button onClick={duplicate} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"><Copy className="w-3.5 h-3.5" /> Duplicate</button>
            {canSubmit && <button onClick={submit} disabled={busy} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"><Send className="w-3.5 h-3.5" /> Submit for Approval</button>}
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
            {canArchive && <button onClick={archive} disabled={busy} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Archive className="w-3.5 h-3.5" /> Archive</button>}
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 space-y-4">
              {jd.summary && <div><p className="text-xs text-muted-foreground mb-1">Summary</p><p className="text-sm">{jd.summary}</p></div>}
              {jd.responsibilities && <div><p className="text-xs text-muted-foreground mb-1">Responsibilities</p><p className="text-sm whitespace-pre-line">{jd.responsibilities}</p></div>}
              <div><p className="text-xs text-muted-foreground mb-1">KRAs</p><TagList items={jd.kras} /></div>
              <div><p className="text-xs text-muted-foreground mb-1">KPIs</p><TagList items={jd.kpis} /></div>
              <div><p className="text-xs text-muted-foreground mb-1">Skills Matrix</p><TagList items={jd.skills} /></div>
              <div><p className="text-xs text-muted-foreground mb-1">Competencies</p><TagList items={jd.competencies} /></div>
              <div><p className="text-xs text-muted-foreground mb-1">Benefits</p><TagList items={jd.benefits} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground mb-1">Qualifications</p><p className="text-sm">{jd.qualifications || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Work Location</p><p className="text-sm">{jd.work_location || '—'}</p></div>
              </div>
              {jd.rejection_reason && <div><p className="text-xs text-muted-foreground mb-1">Rejection Reason</p><p className="text-sm text-red-600">{jd.rejection_reason}</p></div>}
            </CardContent>
          </Card>

          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            <Card>
              <CardContent className="p-5">
                <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2"><Rocket className="w-4 h-4" /> Job Publishing</h3>
                {!jd.vacancy_id ? (
                  <p className="text-xs text-muted-foreground">Link this job description to a vacancy before it can be published.</p>
                ) : !canPublish && !posting ? (
                  <p className="text-xs text-muted-foreground">This job description must be approved before it can be published.</p>
                ) : (
                  <div className="space-y-3">
                    {!posting ? (
                      <button onClick={publish} disabled={busy} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Publish to Career Portal
                      </button>
                    ) : (
                      <>
                        <p className="text-sm">Status: <span className="font-medium">{posting.status}</span> • Visibility: {posting.visibility}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {posting.status === 'open' ? (
                            <button onClick={unpublish} disabled={busy} className="border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">Unpublish</button>
                          ) : (
                            <button onClick={republish} disabled={busy} className="border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">Republish</button>
                          )}
                          <button onClick={loadShare} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"><LinkIcon className="w-3.5 h-3.5" /> Get Share Link & QR</button>
                        </div>
                        {shareInfo && (
                          <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-3">
                            <Image src={shareInfo.qrCodeDataUrl} alt="QR code" width={96} height={96} unoptimized />
                            <div className="text-sm break-all">
                              <a href={shareInfo.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{shareInfo.url}</a>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </Can>
        </div>

        <div>
          <Card>
            <CardContent className="p-5">
              <h3 className="text-base font-bold text-foreground mb-3">Version History</h3>
              <div className="space-y-3">
                {versions.map((v) => (
                  <div key={v.id} className="text-sm flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">v{v.version_number}</p>
                      <p className="text-xs text-muted-foreground">{v.change_note || 'No note'}</p>
                      <p className="text-xs text-muted-foreground">{v.created_by_email || 'System'}</p>
                    </div>
                    {v.version_number !== jd.current_version && (
                      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                        <button onClick={() => restoreVersion(v.version_number)} disabled={busy} className="text-xs text-primary hover:underline shrink-0">Restore</button>
                      </Can>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
