'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  FileArchive,
  FileCheck2,
  FileSignature,
  FileText,
  GitBranch,
  Globe2,
  History,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Pencil,
  PauseCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { vacanciesApi, Vacancy, VacancyAttachment, VacancyStatusHistoryEntry, vacancyFullName } from '@/lib/vacancies-api';
import { applicationsApi, candidatesApi, Application, CandidateAssessment, CandidateCommunication, PipelineStageHistoryEntry } from '@/lib/candidates-api';
import { interviewsApi, Interview } from '@/lib/interviews-api';
import { offersApi, Offer } from '@/lib/offers-api';
import { jobDescriptionsApi, jobPostingsApi, JobBoardPosting, JobBoardProvider, JobDescription } from '@/lib/job-descriptions-api';
import { cn } from '@/lib/utils';
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
type WorkspaceTab =
  | 'overview'
  | 'applications'
  | 'pipeline'
  | 'interviews'
  | 'assessments'
  | 'offers'
  | 'publishing'
  | 'documents'
  | 'timeline'
  | 'analytics'
  | 'activity'
  | 'approvals';

interface VacancyWorkspaceData {
  applications: Application[];
  interviews: Interview[];
  offers: Offer[];
  assessments: Array<CandidateAssessment & { application?: Application }>;
  stageHistory: Array<PipelineStageHistoryEntry & { application?: Application }>;
  communications: Array<CandidateCommunication & { application?: Application }>;
  attachments: VacancyAttachment[];
  resumes: Array<any & { application?: Application }>;
  jobDescriptions: JobDescription[];
  jobBoardPostings: JobBoardPosting[];
}

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'applications', label: 'Applications', icon: Users },
  { key: 'pipeline', label: 'Candidate Pipeline', icon: GitBranch },
  { key: 'interviews', label: 'Interviews', icon: Calendar },
  { key: 'assessments', label: 'Assessments', icon: FileCheck2 },
  { key: 'offers', label: 'Offers', icon: FileSignature },
  { key: 'publishing', label: 'Publishing', icon: Globe2 },
  { key: 'documents', label: 'Documents', icon: FileArchive },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'activity', label: 'Activity Log', icon: MessageSquare },
  { key: 'approvals', label: 'Approvals', icon: ClipboardCheck },
];

const EMPTY_WORKSPACE: VacancyWorkspaceData = {
  applications: [],
  interviews: [],
  offers: [],
  assessments: [],
  stageHistory: [],
  communications: [],
  attachments: [],
  resumes: [],
  jobDescriptions: [],
  jobBoardPostings: [],
};

const JOB_BOARD_PROVIDERS: Array<{ value: JobBoardProvider; label: string }> = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'naukri', label: 'Naukri' },
  { value: 'monster', label: 'Monster' },
  { value: 'glassdoor', label: 'Glassdoor' },
  { value: 'foundit', label: 'Foundit' },
  { value: 'ziprecruiter', label: 'ZipRecruiter' },
  { value: 'other', label: 'Other Job Board' },
];

const JOB_BOARD_STATUS_STYLES: Record<string, string> = {
  ready_to_post: 'bg-blue-50 text-blue-700',
  published: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  unpublished: 'bg-slate-100 text-slate-600',
  expired: 'bg-amber-50 text-amber-700',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || '-'}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function communicationChannelLabel(channel: CandidateCommunication['channel']) {
  return channel === 'phone_note' ? 'Phone note' : channel.replace(/_/g, ' ');
}

function MetricCard({ label, value, sub, icon: Icon }: { label: string; value: number | string; sub: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">{title}</h2>
          </div>
          {action}
        </div>
        <div className="p-5">{children}</div>
      </CardContent>
    </Card>
  );
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  const date = safeDate(value);
  return date ? date.toLocaleDateString() : '-';
}

function formatDateTime(value?: string | null) {
  const date = safeDate(value);
  return date ? date.toLocaleString() : '-';
}

function candidateName(item: { first_name?: string | null; last_name?: string | null }) {
  return [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Candidate';
}

function groupByStatus(items: Application[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
}

function getNextStep(vacancy: Vacancy, workspace: VacancyWorkspaceData) {
  const openApplications = workspace.applications.filter((app) => !['rejected', 'withdrawn', 'hired'].includes(app.status));
  const scheduledInterviews = workspace.interviews.filter((interview) => ['scheduled', 'rescheduled'].includes(interview.status));
  const pendingOffers = workspace.offers.filter((offer) => ['draft', 'pending_approval', 'approved', 'sent'].includes(offer.status));

  if (['draft', 'rejected'].includes(vacancy.status)) {
    return {
      label: 'Submit vacancy for approval',
      description: 'Complete the vacancy details and send it into the approval workflow.',
      target: 'approvals' as WorkspaceTab,
    };
  }
  if (vacancy.status === 'pending_approval') {
    return {
      label: 'Await approval decision',
      description: 'The vacancy is with the configured approval chain. Review the approvals panel for progress.',
      target: 'approvals' as WorkspaceTab,
    };
  }
  if (['approved', 'open', 'reopened'].includes(vacancy.status) && workspace.applications.length === 0) {
    return {
      label: 'Start sourcing candidates',
      description: 'No applications are attached to this vacancy yet. Move to candidates or campaigns to source applicants.',
      target: 'applications' as WorkspaceTab,
    };
  }
  if (openApplications.length > 0 && scheduledInterviews.length === 0 && pendingOffers.length === 0) {
    return {
      label: 'Move candidates through pipeline',
      description: 'Review active candidates, advance stages, and schedule the next interview or assessment.',
      target: 'pipeline' as WorkspaceTab,
    };
  }
  if (scheduledInterviews.length > 0) {
    return {
      label: 'Complete scheduled interviews',
      description: 'Capture feedback and recommendations so the vacancy can move toward offer decisions.',
      target: 'interviews' as WorkspaceTab,
    };
  }
  if (pendingOffers.length > 0) {
    return {
      label: 'Resolve pending offers',
      description: 'Submit, approve, send, or follow up on offers already created for this vacancy.',
      target: 'offers' as WorkspaceTab,
    };
  }
  if (vacancy.status === 'closed') {
    return {
      label: 'Review vacancy outcome',
      description: 'This vacancy is closed. Use analytics and timeline to review hiring performance.',
      target: 'analytics' as WorkspaceTab,
    };
  }
  return {
    label: 'Review workspace',
    description: 'Use the workspace tabs to inspect applications, documents, activity, and approvals.',
    target: 'overview' as WorkspaceTab,
  };
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function ApplicationsPanel({ applications }: { applications: Application[] }) {
  if (!applications.length) return <EmptyState label="No applications are linked to this vacancy yet." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Candidate</th>
            <th className="pb-2 font-medium">Stage</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Source</th>
            <th className="pb-2 font-medium">Applied</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((application) => (
            <tr key={application.id}>
              <td className="py-3">
                <p className="font-medium text-foreground">{candidateName(application)}</p>
                <p className="text-xs text-muted-foreground">{application.candidate_email}</p>
              </td>
              <td className="py-3">{application.stage_name || 'Not staged'}</td>
              <td className="py-3"><StatusPill value={application.status} /></td>
              <td className="py-3 capitalize">{application.source?.replace(/_/g, ' ') || '-'}</td>
              <td className="py-3">{formatDate(application.applied_at)}</td>
              <td className="py-3">
                <Link href={`/dashboard/hr/recruitment/pipeline/${application.id}`} className="text-xs font-medium text-primary hover:underline">
                  Open candidate
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelinePanel({ applications }: { applications: Application[] }) {
  if (!applications.length) return <EmptyState label="No candidates are available for the pipeline yet." />;

  const byStage = applications.reduce<Record<string, Application[]>>((acc, application) => {
    const key = application.stage_name || 'Not staged';
    acc[key] = [...(acc[key] || []), application];
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(byStage).map(([stage, items]) => (
        <div key={stage} className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{stage}</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-foreground">{items.length}</span>
          </div>
          <div className="space-y-2">
            {items.map((application) => (
              <Link
                key={application.id}
                href={`/dashboard/hr/recruitment/pipeline/${application.id}`}
                className="block rounded-lg bg-white p-3 shadow-sm hover:bg-muted"
              >
                <p className="text-sm font-medium text-foreground">{candidateName(application)}</p>
                <p className="text-xs text-muted-foreground">{application.candidate_email}</p>
                <div className="mt-2 flex items-center justify-between">
                  <StatusPill value={application.status} />
                  <span className="text-xs text-muted-foreground">{formatDate(application.applied_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function InterviewsPanel({ interviews }: { interviews: Interview[] }) {
  if (!interviews.length) return <EmptyState label="No interviews are scheduled for this vacancy yet." />;

  return (
    <div className="space-y-3">
      {interviews.map((interview) => (
        <div key={interview.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{candidateName(interview)}</p>
              <p className="text-sm text-muted-foreground">
                Round {interview.round_number} - {interview.round_type} - {interview.interview_type}
              </p>
            </div>
            <StatusPill value={interview.status} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Field label="Scheduled" value={formatDateTime(interview.scheduled_at)} />
            <Field label="Duration" value={`${interview.duration_minutes} min`} />
            <Field label="Location" value={interview.meeting_link || interview.location || '-'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AssessmentsPanel({ assessments }: { assessments: VacancyWorkspaceData['assessments'] }) {
  if (!assessments.length) return <EmptyState label="No assessments have been assigned for this vacancy yet." />;

  return (
    <div className="space-y-3">
      {assessments.map((assessment) => (
        <div key={assessment.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{assessment.title}</p>
              <p className="text-sm text-muted-foreground">
                {assessment.application ? candidateName(assessment.application) : 'Candidate'} - {assessment.assessment_type}
              </p>
            </div>
            <StatusPill value={assessment.status} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
            <Field label="Assigned" value={formatDate(assessment.assigned_at)} />
            <Field label="Due" value={formatDate(assessment.due_at)} />
            <Field label="Score" value={assessment.score != null ? `${assessment.score}/${assessment.max_score}` : '-'} />
            <Field label="Result" value={assessment.result || '-'} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OffersPanel({ offers }: { offers: Offer[] }) {
  if (!offers.length) return <EmptyState label="No offers have been created for this vacancy yet." />;

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <Link key={offer.id} href={`/dashboard/hr/recruitment/offers/${offer.id}`} className="block rounded-lg border border-border p-4 hover:bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{candidateName(offer)}</p>
              <p className="text-sm text-muted-foreground">{offer.designation || offer.job_title || 'Offer'}</p>
            </div>
            <StatusPill value={offer.status} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
            <Field label="CTC" value={offer.ctc != null ? `${offer.currency} ${offer.ctc.toLocaleString()}` : '-'} />
            <Field label="Joining Date" value={formatDate(offer.joining_date)} />
            <Field label="Sent" value={formatDate(offer.sent_at)} />
            <Field label="Response" value={formatDate(offer.responded_at)} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function DocumentsPanel({ vacancyId, workspace }: { vacancyId: string; workspace: VacancyWorkspaceData }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-base font-bold text-foreground">Vacancy Documents</h3>
        <VacancyAttachments vacancyId={vacancyId} />
      </div>
      <div>
        <h3 className="mb-3 text-base font-bold text-foreground">Candidate Resumes</h3>
        {!workspace.resumes.length ? <EmptyState label="No candidate resumes are attached to applications for this vacancy." /> : (
          <div className="space-y-2">
            {workspace.resumes.map((resume, index) => (
              <div key={resume.id || index} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{resume.name || resume.file_name || 'Resume'}</p>
                  <p className="text-xs text-muted-foreground">{resume.application ? candidateName(resume.application) : 'Candidate'}</p>
                </div>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PublishingPanel({
  vacancy,
  jobDescriptions,
  postings,
  onPublish,
  onUpdate,
  onUnpublish,
}: {
  vacancy: Vacancy;
  jobDescriptions: JobDescription[];
  postings: JobBoardPosting[];
  onPublish: (data: { jobDescriptionId: string; provider: JobBoardProvider; externalUrl?: string }) => Promise<void>;
  onUpdate: (id: string, data: { status?: JobBoardPosting['status']; external_url?: string }) => Promise<void>;
  onUnpublish: (id: string) => Promise<void>;
}) {
  const approvedJds = jobDescriptions.filter((jd) => jd.status === 'approved');
  const [jobDescriptionId, setJobDescriptionId] = useState(approvedJds[0]?.id ?? '');
  const [provider, setProvider] = useState<JobBoardProvider>('linkedin');
  const [externalUrl, setExternalUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobDescriptionId && approvedJds[0]?.id) setJobDescriptionId(approvedJds[0].id);
  }, [approvedJds, jobDescriptionId]);

  const usedProviders = new Set(postings.filter((posting) => posting.status !== 'unpublished').map((posting) => posting.provider));
  const availableProviders = JOB_BOARD_PROVIDERS.filter((item) => item.value === provider || !usedProviders.has(item.value));

  const copy = async (posting: JobBoardPosting) => {
    await navigator.clipboard.writeText(posting.apply_url);
    setCopiedId(posting.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  const publish = async () => {
    if (!jobDescriptionId) return;
    setBusy(true);
    try {
      await onPublish({ jobDescriptionId, provider, externalUrl: externalUrl.trim() || undefined });
      setExternalUrl('');
    } finally {
      setBusy(false);
    }
  };

  if (!['open', 'reopened', 'on_hold'].includes(vacancy.status)) {
    return <EmptyState label="Open or approve this vacancy before publishing it to external job boards." />;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_1.2fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Approved job description</label>
            <select
              value={jobDescriptionId}
              onChange={(event) => setJobDescriptionId(event.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {!approvedJds.length && <option value="">No approved JD available</option>}
              {approvedJds.map((jd) => <option key={jd.id} value={jd.id}>{jd.title}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Job board</label>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as JobBoardProvider)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {availableProviders.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">External listing URL</label>
            <input
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="Paste after posting on the job board"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-end">
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              <button
                onClick={publish}
                disabled={busy || !jobDescriptionId}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                Add Board
              </button>
            </Can>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This creates a tracked apply link for the selected board. Paste that link into LinkedIn, Indeed, or another job board so applications return to this ATS with source attribution.
        </p>
      </div>

      {!postings.length ? (
        <EmptyState label="No external job boards have been added for this vacancy yet." />
      ) : (
        <div className="space-y-3">
          {postings.map((posting) => {
            const providerLabel = JOB_BOARD_PROVIDERS.find((item) => item.value === posting.provider)?.label || posting.provider;
            return (
              <div key={posting.id} className="rounded-lg border border-border bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{providerLabel}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${JOB_BOARD_STATUS_STYLES[posting.status] || 'bg-muted text-muted-foreground'}`}>
                        {posting.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Source-tracked apply link</p>
                    <p className="mt-1 truncate rounded-md bg-muted/40 px-2 py-1 text-xs text-foreground">{posting.apply_url}</p>
                    {posting.external_url && (
                      <a href={posting.external_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        View external listing <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button onClick={() => copy(posting)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      {copiedId === posting.id ? 'Copied' : 'Copy Link'}
                    </button>
                    <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                      <button
                        onClick={() => onUpdate(posting.id, { status: 'published', external_url: posting.external_url || undefined })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        Mark Published
                      </button>
                      {posting.status !== 'unpublished' && (
                        <button onClick={() => onUnpublish(posting.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                          Unpublish
                        </button>
                      )}
                    </Can>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({ history, stageHistory }: { history: VacancyStatusHistoryEntry[]; stageHistory: VacancyWorkspaceData['stageHistory'] }) {
  const items = [
    ...history.map((item) => ({
      id: item.id,
      date: item.created_at,
      title: `${item.from_status ? `${item.from_status.replace(/_/g, ' ')} to ` : ''}${item.to_status.replace(/_/g, ' ')}`,
      detail: item.reason,
      actor: item.actor_email || 'System',
      type: 'Vacancy',
    })),
    ...stageHistory.map((item) => ({
      id: item.id,
      date: item.created_at,
      title: `${item.from_stage_name || 'Not staged'} to ${item.to_stage_name || 'Not staged'}`,
      detail: item.comment,
      actor: item.actor_email || 'System',
      type: item.application ? candidateName(item.application) : 'Candidate',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!items.length) return <EmptyState label="No timeline events are available yet." />;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={`${item.type}-${item.id}`} className="relative border-l border-border pl-4">
          <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-primary" />
          <p className="text-sm font-semibold capitalize text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.type} - {item.actor} - {formatDistanceToNow(parseISO(item.date), { addSuffix: true })}</p>
          {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </div>
  );
}

function AnalyticsPanel({ vacancy, workspace }: { vacancy: Vacancy; workspace: VacancyWorkspaceData }) {
  const statuses = groupByStatus(workspace.applications);
  const filled = statuses.hired || 0;
  const target = vacancy.number_of_positions || 1;
  const fillRate = Math.round((filled / target) * 100);
  const responseOffers = workspace.offers.filter((offer) => ['accepted', 'declined'].includes(offer.status)).length;
  const acceptedOffers = workspace.offers.filter((offer) => offer.status === 'accepted').length;
  const offerRate = responseOffers ? Math.round((acceptedOffers / responseOffers) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Applications" value={workspace.applications.length} sub="Total candidates" icon={Users} />
        <MetricCard label="Interviews" value={workspace.interviews.length} sub="All rounds" icon={Calendar} />
        <MetricCard label="Fill Rate" value={`${fillRate}%`} sub={`${filled} of ${target} positions filled`} icon={UserCheck} />
        <MetricCard label="Offer Acceptance" value={`${offerRate}%`} sub={`${acceptedOffers} accepted offers`} icon={FileSignature} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Section title="Application Status" icon={BarChart3}>
          {!workspace.applications.length ? <EmptyState label="No application analytics yet." /> : (
            <div className="space-y-2">
              {Object.entries(statuses).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <span className="text-sm font-medium capitalize text-foreground">{status.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-bold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Stage Distribution" icon={GitBranch}>
          {!workspace.applications.length ? <EmptyState label="No stage analytics yet." /> : (
            <div className="space-y-2">
              {Object.entries(workspace.applications.reduce<Record<string, number>>((acc, app) => {
                const stage = app.stage_name || 'Not staged';
                acc[stage] = (acc[stage] || 0) + 1;
                return acc;
              }, {})).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{stage}</span>
                  <span className="text-sm font-bold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function ActivityPanel({ workspace, history }: { workspace: VacancyWorkspaceData; history: VacancyStatusHistoryEntry[] }) {
  const items = [
    ...history.map((item) => ({
      id: item.id,
      date: item.created_at,
      title: `Vacancy status changed to ${item.to_status.replace(/_/g, ' ')}`,
      detail: item.reason,
      actor: item.actor_email || 'System',
    })),
    ...workspace.communications.map((item) => ({
      id: item.id,
      date: item.sent_at,
      title: `${communicationChannelLabel(item.channel)} ${item.status}: ${item.subject}`,
      detail: item.application ? candidateName(item.application) : null,
      actor: item.sent_by_email || 'System',
    })),
    ...workspace.offers.map((item) => ({
      id: item.id,
      date: item.updated_at || item.created_at,
      title: `Offer ${item.status.replace(/_/g, ' ')}`,
      detail: candidateName(item),
      actor: item.created_by_email || 'System',
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!items.length) return <EmptyState label="No activity has been recorded for this vacancy yet." />;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.title}-${item.id}`} className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {item.detail && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {item.actor} - {formatDistanceToNow(parseISO(item.date), { addSuffix: true })}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function VacancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [history, setHistory] = useState<VacancyStatusHistoryEntry[]>([]);
  const [workspace, setWorkspace] = useState<VacancyWorkspaceData>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadWorkspace = async (vacancyId: string) => {
    setWorkspaceLoading(true);
    try {
      const [applicationResult, attachments, jobDescriptionResult, jobBoardPostings] = await Promise.all([
        applicationsApi.list({ vacancy_id: vacancyId, limit: 100 }),
        vacanciesApi.attachments.list(vacancyId).catch(() => []),
        jobDescriptionsApi.list({ vacancy_id: vacancyId, status: 'approved', limit: 100 }).catch(() => ({ data: [], total: 0 })),
        jobPostingsApi.boards.list(vacancyId).catch(() => []),
      ]);
      const applications = applicationResult.data;

      const [interviewGroups, offerGroups, assessmentGroups, stageHistoryGroups, communicationGroups, resumeGroups] = await Promise.all([
        Promise.all(applications.map((application) => interviewsApi.list({ application_id: application.id, limit: 100 }).then((result) => result.data).catch(() => []))),
        Promise.all(applications.map((application) => offersApi.list({ application_id: application.id, limit: 100 }).then((result) => result.data).catch(() => []))),
        Promise.all(applications.map((application) => applicationsApi.assessments.list(application.id).then((items) => items.map((item) => ({ ...item, application }))).catch(() => []))),
        Promise.all(applications.map((application) => applicationsApi.stageHistory(application.id).then((items) => items.map((item) => ({ ...item, application }))).catch(() => []))),
        Promise.all(applications.map((application) => applicationsApi.communications.list(application.id).then((items) => items.map((item) => ({ ...item, application }))).catch(() => []))),
        Promise.all(applications.map((application) => candidatesApiSafeResumes(application).catch(() => []))),
      ]);

      setWorkspace({
        applications,
        interviews: interviewGroups.flat().sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
        offers: offerGroups.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        assessments: assessmentGroups.flat().sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()),
        stageHistory: stageHistoryGroups.flat(),
        communications: communicationGroups.flat(),
        attachments,
        resumes: resumeGroups.flat(),
        jobDescriptions: jobDescriptionResult.data,
        jobBoardPostings,
      });
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const load = () => {
    setLoading(true);
    Promise.all([vacanciesApi.get(id), vacanciesApi.history(id)])
      .then(([v, h]) => {
        setVacancy(v);
        setHistory(h);
        void loadWorkspace(v.id);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const submitForApproval = async () => {
    setSubmitting(true);
    try { await vacanciesApi.submit(id); load(); } finally { setSubmitting(false); }
  };

  const refreshPublishing = async () => {
    const [jobDescriptionResult, jobBoardPostings] = await Promise.all([
      jobDescriptionsApi.list({ vacancy_id: id, status: 'approved', limit: 100 }).catch(() => ({ data: [], total: 0 })),
      jobPostingsApi.boards.list(id).catch(() => []),
    ]);
    setWorkspace((current) => ({
      ...current,
      jobDescriptions: jobDescriptionResult.data,
      jobBoardPostings,
    }));
  };

  const publishToJobBoard = async ({ jobDescriptionId, provider, externalUrl }: { jobDescriptionId: string; provider: JobBoardProvider; externalUrl?: string }) => {
    await jobPostingsApi.boards.publish({
      vacancy_id: id,
      job_description_id: jobDescriptionId,
      provider,
      external_url: externalUrl,
      closes_at: vacancy?.target_close_date ?? undefined,
    });
    await refreshPublishing();
  };

  const updateJobBoardPosting = async (postingId: string, data: { status?: JobBoardPosting['status']; external_url?: string }) => {
    await jobPostingsApi.boards.update(postingId, data);
    await refreshPublishing();
  };

  const unpublishJobBoardPosting = async (postingId: string) => {
    await jobPostingsApi.boards.unpublish(postingId);
    await refreshPublishing();
  };

  const workspaceStats = useMemo(() => {
    const activeApplications = workspace.applications.filter((application) => !['rejected', 'withdrawn', 'hired'].includes(application.status)).length;
    const pendingOffers = workspace.offers.filter((offer) => ['draft', 'pending_approval', 'approved', 'sent'].includes(offer.status)).length;
    return {
      activeApplications,
      scheduledInterviews: workspace.interviews.filter((interview) => ['scheduled', 'rescheduled'].includes(interview.status)).length,
      pendingOffers,
      hired: workspace.applications.filter((application) => application.status === 'hired').length,
    };
  }, [workspace]);

  if (loading || !vacancy) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const canEdit = ['draft', 'rejected'].includes(vacancy.status);
  const canSubmit = ['draft', 'rejected'].includes(vacancy.status);
  const canApprove = ['pending_approval'].includes(vacancy.status);
  const canClose = ['open', 'on_hold', 'reopened'].includes(vacancy.status);
  const canReopen = vacancy.status === 'closed';
  const canArchive = ['closed', 'rejected', 'cancelled'].includes(vacancy.status);
  const nextStep = getNextStep(vacancy, workspace);

  const salaryRange = vacancy.salary_min || vacancy.salary_max
    ? `${vacancy.currency || 'INR'} ${vacancy.salary_min ?? '-'} - ${vacancy.salary_max ?? '-'}`
    : '-';
  const experienceRange = vacancy.experience_min_years || vacancy.experience_max_years
    ? `${vacancy.experience_min_years ?? 0} - ${vacancy.experience_max_years ?? '-'} yrs`
    : '-';

  return (
    <div className="space-y-5">
      {showEdit && <VacancyDrawer vacancy={vacancy} onClose={() => setShowEdit(false)} onSaved={load} />}
      {dialog === 'approve' && (
        <VacancyActionDialog
          title="Approve Vacancy"
          reasonRequired
          confirmLabel="Approve"
          confirmClassName="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onConfirm={async (reason) => { await vacanciesApi.approve(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && (
        <VacancyActionDialog
          title="Reject Vacancy"
          reasonRequired
          confirmLabel="Reject"
          confirmClassName="bg-red-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          onConfirm={async (reason) => { await vacanciesApi.reject(id, reason); load(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'close' && (
        <VacancyActionDialog title="Close Vacancy" reasonLabel="Reason (optional)" confirmLabel="Close" onConfirm={async (reason) => { await vacanciesApi.close(id, reason || undefined); load(); }} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reopen' && (
        <VacancyActionDialog title="Reopen Vacancy" reasonLabel="Reason (optional)" confirmLabel="Reopen" onConfirm={async (reason) => { await vacanciesApi.reopen(id, reason || undefined); load(); }} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archive' && (
        <VacancyActionDialog title="Archive Vacancy" reasonLabel="Reason (optional)" confirmLabel="Archive" onConfirm={async (reason) => { await vacanciesApi.archive(id, reason || undefined); load(); }} onClose={() => setDialog(null)} />
      )}

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => router.push('/dashboard/hr/recruitment/vacancies')} className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{vacancy.title}</h1>
                <VacancyStatusBadge status={vacancy.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {vacancy.department_name || 'No department'} - {vacancy.branch_name || 'No branch'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Recruiter: {vacancyFullName('recruiter', vacancy) || 'Unassigned'} - Hiring manager: {vacancyFullName('hiring_manager', vacancy) || 'Unassigned'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              {canEdit && (
                <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </Can>
            <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
              {canSubmit && (
                <button onClick={submitForApproval} disabled={submitting} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit
                </button>
              )}
            </Can>
            <Can permission={PERMISSIONS.RECRUITMENT_APPROVE}>
              {canApprove && (
                <>
                  <button onClick={() => setDialog('approve')} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => setDialog('reject')} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </>
              )}
            </Can>
            <Can permission={PERMISSIONS.RECRUITMENT_CLOSE}>
              {canClose && (
                <button onClick={() => setDialog('close')} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <PauseCircle className="h-3.5 w-3.5" /> Close
                </button>
              )}
            </Can>
            <Can permission={PERMISSIONS.RECRUITMENT_REOPEN}>
              {canReopen && (
                <button onClick={() => setDialog('reopen')} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <RotateCcw className="h-3.5 w-3.5" /> Reopen
                </button>
              )}
            </Can>
            <Can permission={PERMISSIONS.RECRUITMENT_ARCHIVE}>
              {canArchive && (
                <button onClick={() => setDialog('archive')} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              )}
            </Can>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Next step: {nextStep.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{nextStep.description}</p>
              <button onClick={() => setActiveTab(nextStep.target)} className="mt-3 text-sm font-medium text-primary hover:underline">
                Open {WORKSPACE_TABS.find((tab) => tab.key === nextStep.target)?.label}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-white p-3">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : workspace.applications.length}</p>
            <p className="text-[11px] text-muted-foreground">Apps</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : workspaceStats.scheduledInterviews}</p>
            <p className="text-[11px] text-muted-foreground">Interviews</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : workspaceStats.pendingOffers}</p>
            <p className="text-[11px] text-muted-foreground">Offers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : workspaceStats.hired}</p>
            <p className="text-[11px] text-muted-foreground">Hired</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12">
          {WORKSPACE_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors',
                activeTab === key ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {workspaceLoading && activeTab !== 'overview' && (
        <div className="flex items-center justify-center rounded-lg border border-border bg-white py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Positions" value={vacancy.number_of_positions} sub="Approved headcount" icon={Briefcase} />
              <MetricCard label="Active Candidates" value={workspaceStats.activeApplications} sub="Not rejected, withdrawn, or hired" icon={Users} />
              <MetricCard label="Scheduled Interviews" value={workspaceStats.scheduledInterviews} sub="Upcoming or rescheduled" icon={Calendar} />
              <MetricCard label="Pending Offers" value={workspaceStats.pendingOffers} sub="Draft, approval, sent" icon={FileSignature} />
            </div>
            <Section title="Vacancy Overview" icon={LayoutDashboard}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Field label="Position" value={vacancy.position_name} />
                <Field label="Employment Type" value={vacancy.employment_type_name} />
                <Field label="Number of Positions" value={vacancy.number_of_positions} />
                <Field label="Hiring Manager" value={vacancyFullName('hiring_manager', vacancy)} />
                <Field label="Recruiter" value={vacancyFullName('recruiter', vacancy)} />
                <Field label="Reporting Manager" value={vacancyFullName('reporting_manager', vacancy)} />
                <Field label="Experience" value={experienceRange} />
                <Field label="Salary Range" value={salaryRange} />
                <Field label="Qualification" value={vacancy.qualification} />
                <Field label="Target Start" value={formatDate(vacancy.target_start_date)} />
                <Field label="Target Close" value={formatDate(vacancy.target_close_date)} />
                <Field label="Created By" value={vacancy.created_by_email} />
                {vacancy.rejection_reason && <Field label="Rejection Reason" value={vacancy.rejection_reason} />}
                {vacancy.close_reason && <Field label="Close Reason" value={vacancy.close_reason} />}
                {vacancy.description && <div className="col-span-full"><Field label="Description" value={vacancy.description} /></div>}
                {vacancy.justification && <div className="col-span-full"><Field label="Justification" value={vacancy.justification} /></div>}
              </div>
            </Section>
          </div>
          <div className="space-y-5">
            <Section title="Recruiter Notes" icon={MessageSquare}>
              <VacancyComments vacancyId={vacancy.id} />
            </Section>
          </div>
        </div>
      )}

      {activeTab === 'applications' && !workspaceLoading && (
        <Section title="Applications" icon={Users} action={<Link href="/dashboard/hr/recruitment/candidates" className="text-xs font-medium text-primary hover:underline">View all candidates</Link>}>
          <ApplicationsPanel applications={workspace.applications} />
        </Section>
      )}

      {activeTab === 'pipeline' && !workspaceLoading && (
        <Section title="Candidate Pipeline" icon={GitBranch} action={<Link href="/dashboard/hr/recruitment/pipeline" className="text-xs font-medium text-primary hover:underline">Open pipeline board</Link>}>
          <PipelinePanel applications={workspace.applications} />
        </Section>
      )}

      {activeTab === 'interviews' && !workspaceLoading && (
        <Section title="Interviews" icon={Calendar} action={<Link href="/dashboard/hr/recruitment/interviews" className="text-xs font-medium text-primary hover:underline">Schedule interview</Link>}>
          <InterviewsPanel interviews={workspace.interviews} />
        </Section>
      )}

      {activeTab === 'assessments' && !workspaceLoading && (
        <Section title="Assessments" icon={FileCheck2}>
          <AssessmentsPanel assessments={workspace.assessments} />
        </Section>
      )}

      {activeTab === 'offers' && !workspaceLoading && (
        <Section title="Offers" icon={FileSignature} action={<Link href="/dashboard/hr/recruitment/offers" className="text-xs font-medium text-primary hover:underline">Create offer</Link>}>
          <OffersPanel offers={workspace.offers} />
        </Section>
      )}

      {activeTab === 'publishing' && !workspaceLoading && (
        <Section title="External Job Publishing" icon={Globe2}>
          <PublishingPanel
            vacancy={vacancy}
            jobDescriptions={workspace.jobDescriptions}
            postings={workspace.jobBoardPostings}
            onPublish={publishToJobBoard}
            onUpdate={updateJobBoardPosting}
            onUnpublish={unpublishJobBoardPosting}
          />
        </Section>
      )}

      {activeTab === 'documents' && !workspaceLoading && (
        <Section title="Documents" icon={FileArchive}>
          <DocumentsPanel vacancyId={vacancy.id} workspace={workspace} />
        </Section>
      )}

      {activeTab === 'timeline' && !workspaceLoading && (
        <Section title="Timeline" icon={History}>
          <TimelinePanel history={history} stageHistory={workspace.stageHistory} />
        </Section>
      )}

      {activeTab === 'analytics' && !workspaceLoading && (
        <AnalyticsPanel vacancy={vacancy} workspace={workspace} />
      )}

      {activeTab === 'activity' && !workspaceLoading && (
        <Section title="Activity Log" icon={MessageSquare}>
          <ActivityPanel workspace={workspace} history={history} />
        </Section>
      )}

      {activeTab === 'approvals' && (
        <Section title="Approvals" icon={ClipboardCheck}>
          {vacancy.approval_status === 'not_required' ? (
            <EmptyState label="This vacancy does not require approval." />
          ) : (
            <ApprovalTimeline
              request={{
                approval_log: vacancy.approval_log,
                current_step: vacancy.approval_step,
                total_steps: null,
                status: vacancy.approval_status,
              } as any}
            />
          )}
        </Section>
      )}
    </div>
  );
}

async function candidatesApiSafeResumes(application: Application) {
  const resumes = await candidatesApi.resumes.list(application.candidate_id);
  return resumes.map((resume: any) => ({ ...resume, application }));
}
