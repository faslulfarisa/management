'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileArchive,
  FileCheck2,
  FileSignature,
  FileText,
  GitBranch,
  History,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Send,
  Star,
  Tags,
  User,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  applicationsApi,
  candidatesApi,
  Application,
  Candidate,
  CandidateAssessment,
  CandidateCommunication,
  CandidateEvaluation,
  PipelineStageHistoryEntry,
} from '@/lib/candidates-api';
import { interviewsApi, Interview } from '@/lib/interviews-api';
import { offersApi, Offer } from '@/lib/offers-api';
import { preboardingApi, PreboardingChecklist } from '@/lib/onboarding-api';
import { communicationTemplatesApi, CommunicationTemplate } from '@/lib/pipeline-api';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CandidateResumes } from '@/components/recruitment/candidate-resumes';
import { InterviewDrawer } from '@/components/recruitment/interview-drawer';
import { InterviewFeedbackModal } from '@/components/recruitment/interview-feedback-modal';
import { PreboardingChecklistCard } from '@/components/recruitment/preboarding-checklist';

type WorkspaceTab =
  | 'profile'
  | 'resume'
  | 'timeline'
  | 'applications'
  | 'documents'
  | 'interviews'
  | 'assessments'
  | 'communications'
  | 'tags'
  | 'offers'
  | 'preboarding'
  | 'activity';

interface ApplicationWorkspace {
  application: Application;
  interviews: Interview[];
  assessments: CandidateAssessment[];
  evaluations: CandidateEvaluation[];
  communications: CandidateCommunication[];
  stageHistory: PipelineStageHistoryEntry[];
  offers: Offer[];
  preboarding: PreboardingChecklist | null;
  preboardingDocuments: any[];
}

interface CandidateWorkspaceData {
  applications: Application[];
  appWorkspaces: ApplicationWorkspace[];
  resumes: any[];
}

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'resume', label: 'Resume', icon: FileText },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'applications', label: 'Applications', icon: Briefcase },
  { key: 'documents', label: 'Documents', icon: FileArchive },
  { key: 'interviews', label: 'Interview Management', icon: Calendar },
  { key: 'assessments', label: 'Assessment Results', icon: FileCheck2 },
  { key: 'communications', label: 'Communication Workspace', icon: MessageSquare },
  { key: 'tags', label: 'Tags', icon: Tags },
  { key: 'offers', label: 'Offers', icon: FileSignature },
  { key: 'preboarding', label: 'Preboarding Status', icon: ClipboardCheck },
  { key: 'activity', label: 'Activity Timeline', icon: GitBranch },
];

const STATUS_STYLES: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  under_review: 'bg-amber-50 text-amber-700',
  shortlisted: 'bg-violet-50 text-violet-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  hired: 'bg-emerald-50 text-emerald-700',
};

const STATUS_FLOW: Record<string, string[]> = {
  applied: ['under_review', 'rejected'],
  under_review: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  withdrawn: [],
  hired: [],
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

function MetricCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub: string; icon: React.ElementType }) {
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

function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[value] || 'bg-muted text-muted-foreground'}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function MiniPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
      {value.replace(/_/g, ' ')}
    </span>
  );
}

const COMMUNICATION_CHANNELS: Array<{ value: CandidateCommunication['channel']; label: string; icon: React.ElementType; description: string }> = [
  { value: 'email', label: 'Email', icon: Mail, description: 'Send to candidate email' },
  { value: 'sms', label: 'SMS', icon: MessageCircle, description: 'Log candidate SMS' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, description: 'Log WhatsApp message' },
  { value: 'phone_note', label: 'Phone Notes', icon: Phone, description: 'Record call outcome' },
  { value: 'internal_note', label: 'Internal Notes', icon: MessageSquare, description: 'Private hiring note' },
];

function communicationChannelLabel(channel: CandidateCommunication['channel']) {
  return COMMUNICATION_CHANNELS.find((item) => item.value === channel)?.label || channel.replace(/_/g, ' ');
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

function candidateName(candidate: Pick<Candidate, 'first_name' | 'last_name'> | Application | Offer | Interview) {
  return [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Candidate';
}

function getLatestApplication(applications: Application[]) {
  return [...applications].sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())[0] || null;
}

function getNextStep(data: CandidateWorkspaceData) {
  const latest = getLatestApplication(data.applications);
  const activeInterviews = data.appWorkspaces.flatMap((item) => item.interviews).filter((item) => ['scheduled', 'rescheduled'].includes(item.status));
  const pendingOffers = data.appWorkspaces.flatMap((item) => item.offers).filter((item) => ['draft', 'pending_approval', 'approved', 'sent'].includes(item.status));
  const hiredWorkspace = data.appWorkspaces.find((item) => item.application.status === 'hired');

  if (!latest) {
    return { label: 'Attach candidate to a vacancy', description: 'This candidate has no applications yet. Add or source them into an open vacancy.', target: 'applications' as WorkspaceTab };
  }
  if (activeInterviews.length) {
    return { label: 'Complete interview feedback', description: 'There are scheduled interviews that need feedback or a completion decision.', target: 'interviews' as WorkspaceTab };
  }
  if (pendingOffers.length) {
    return { label: 'Resolve offer workflow', description: 'An offer is waiting for approval, sending, or candidate response.', target: 'offers' as WorkspaceTab };
  }
  if (hiredWorkspace?.preboarding) {
    return { label: 'Finish preboarding', description: 'Review checklist progress, documents, and joining readiness.', target: 'preboarding' as WorkspaceTab };
  }
  if (['applied', 'under_review', 'shortlisted'].includes(latest.status)) {
    return { label: 'Move candidate forward', description: 'Review the latest application and move the candidate to the next hiring stage.', target: 'applications' as WorkspaceTab };
  }
  return { label: 'Review candidate history', description: 'Use the timeline, communications, and documents to understand the candidate record.', target: 'timeline' as WorkspaceTab };
}

function ProfilePanel({ candidate }: { candidate: Candidate }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Field label="Current Company" value={candidate.current_company} />
        <Field label="Current Role" value={candidate.current_designation} />
        <Field label="Experience" value={candidate.experience_years != null ? `${candidate.experience_years} yrs` : null} />
        <Field label="Expected Salary" value={candidate.expected_salary != null ? `INR ${candidate.expected_salary.toLocaleString()}` : null} />
        <Field label="Source" value={candidate.source?.replace(/_/g, ' ')} />
        <Field label="Gender" value={candidate.gender} />
        <Field label="Date of Birth" value={formatDate(candidate.date_of_birth)} />
        <Field label="Applications" value={candidate.application_count ?? 0} />
        <Field label="Created" value={formatDate(candidate.created_at)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Education</p>
          {!candidate.education?.length ? <p className="text-sm text-muted-foreground">No education details recorded.</p> : (
            <div className="space-y-2">
              {candidate.education.map((item, index) => (
                <div key={index}>
                  <p className="text-sm font-medium text-foreground">{item.degree || 'Degree'}</p>
                  <p className="text-xs text-muted-foreground">{item.institution || '-'} {item.year ? `- ${item.year}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Experience</p>
          {!candidate.experience?.length ? <p className="text-sm text-muted-foreground">No prior experience recorded.</p> : (
            <div className="space-y-2">
              {candidate.experience.map((item, index) => (
                <div key={index}>
                  <p className="text-sm font-medium text-foreground">{item.title || 'Role'} at {item.company || 'Company'}</p>
                  <p className="text-xs text-muted-foreground">{item.from || '-'} to {item.to || 'present'}</p>
                  {item.description && <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplicationsPanel({
  applications,
  onUpdateStatus,
}: {
  applications: Application[];
  onUpdateStatus: (appId: string, status: Application['status']) => Promise<void>;
}) {
  if (!applications.length) return <EmptyState label="No applications have been created for this candidate yet." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">Vacancy</th>
            <th className="pb-2 font-medium">Stage</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Source</th>
            <th className="pb-2 font-medium">Applied</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((application) => (
            <tr key={application.id}>
              <td className="py-3">
                <p className="font-medium text-foreground">{application.job_title}</p>
                {application.vacancy_id && (
                  <Link href={`/dashboard/hr/recruitment/vacancies/${application.vacancy_id}`} className="text-xs text-primary hover:underline">
                    Open vacancy workspace
                  </Link>
                )}
              </td>
              <td className="py-3">{application.stage_name || 'Not staged'}</td>
              <td className="py-3"><StatusPill value={application.status} /></td>
              <td className="py-3 capitalize">{application.source?.replace(/_/g, ' ') || '-'}</td>
              <td className="py-3">{formatDate(application.applied_at)}</td>
              <td className="py-3">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/dashboard/hr/recruitment/pipeline/${application.id}`} className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                    Open pipeline
                  </Link>
                  <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                    {STATUS_FLOW[application.status]?.map((next) => (
                      <button key={next} onClick={() => onUpdateStatus(application.id, next as Application['status'])} className="rounded-lg border border-border px-2 py-1 text-xs font-medium capitalize hover:bg-muted">
                        {next.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </Can>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getScorecardAverage(scorecard: Interview['scorecard']) {
  if (!scorecard?.length) return null;
  return scorecard.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / scorecard.length;
}

function getInterviewStatusHint(interview: Interview) {
  if (['scheduled', 'rescheduled'].includes(interview.status)) return 'Next action: collect panel feedback or complete the round after the interview.';
  if (interview.status === 'completed') return 'Decision captured. Use the recommendation and assessment results to move the application forward.';
  if (interview.status === 'cancelled') return interview.cancellation_reason ? `Cancelled: ${interview.cancellation_reason}` : 'Cancelled. Reschedule from the active application if this round is still required.';
  if (interview.status === 'no_show') return 'Candidate did not attend. Review notes before deciding whether to reschedule or reject.';
  return 'Review the interview record before taking the next step.';
}

function InterviewsPanel({
  workspaces,
  resumes,
  onSchedule,
  onReschedule,
  onFeedback,
  onComplete,
  onCancel,
}: {
  workspaces: ApplicationWorkspace[];
  resumes: any[];
  onSchedule: (applicationId: string) => void;
  onReschedule: (interview: Interview) => void;
  onFeedback: (interview: Interview) => void;
  onComplete: (interview: Interview) => Promise<void>;
  onCancel: (interview: Interview) => Promise<void>;
}) {
  const interviews = workspaces.flatMap((workspace) => workspace.interviews.map((interview) => ({ ...interview, application: workspace.application })));
  const activeApplications = workspaces.filter((workspace) => !['rejected', 'withdrawn', 'hired'].includes(workspace.application.status));

  if (!interviews.length) {
    return (
      <div className="space-y-4">
        <EmptyState label="No interviews have been scheduled for this candidate." />
        {!!activeApplications.length && (
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            <div className="flex flex-wrap gap-2">
              {activeApplications.map((workspace) => (
                <button key={workspace.application.id} onClick={() => onSchedule(workspace.application.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Schedule for {workspace.application.job_title}
                </button>
              ))}
            </div>
          </Can>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!!activeApplications.length && (
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-3">
            <span className="text-xs font-medium text-muted-foreground">Schedule next round</span>
            {activeApplications.map((workspace) => (
              <button key={workspace.application.id} onClick={() => onSchedule(workspace.application.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
                <Plus className="h-3 w-3" /> {workspace.application.job_title}
              </button>
            ))}
          </div>
        </Can>
      )}
      {interviews.map((interview) => (
        <div key={interview.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{interview.application.job_title}</p>
              <p className="text-sm text-muted-foreground">
                Round {interview.round_number} - {interview.round_type.replace(/_/g, ' ')} - {interview.interview_type.replace(/_/g, ' ')}
              </p>
            </div>
            <MiniPill value={interview.status} />
          </div>
          <p className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">{getInterviewStatusHint(interview)}</p>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Schedule</p>
              <Field label="Date and Time" value={formatDateTime(interview.scheduled_at)} />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Duration" value={`${interview.duration_minutes} min`} />
                <Field label="Mode" value={interview.interview_type.replace(/_/g, ' ')} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Interview Panel</p>
              <Field label="Panel Members" value={interview.panel_member_ids?.length ? `${interview.panel_member_ids.length} assigned` : 'Not assigned'} />
              <div className="mt-2">
                <Field label="Scorecards Submitted" value={interview.scorecard?.length || 0} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Meeting Details</p>
              <Field label="Location" value={interview.location || '-'} />
              <div className="mt-2">
                <Field label="Meeting Link" value={interview.meeting_link ? <a href={interview.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Link2 className="h-3 w-3" /> Open link</a> : '-'} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Scorecards and Feedback</p>
                {getScorecardAverage(interview.scorecard) != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    <Star className="h-3 w-3" /> {getScorecardAverage(interview.scorecard)?.toFixed(1)}/5 avg
                  </span>
                )}
              </div>
              {!interview.scorecard?.length ? (
                <p className="text-sm text-muted-foreground">No panel scorecards submitted yet.</p>
              ) : (
                <div className="space-y-2">
                  {interview.scorecard.map((entry) => (
                    <div key={entry.panelist_id} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">Panelist feedback</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold capitalize">{entry.recommendation?.replace(/_/g, ' ') || 'No recommendation'}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Rating {entry.rating}/5 - {formatDateTime(entry.submitted_at)}</p>
                      {entry.comments && <p className="mt-2 text-sm text-muted-foreground">{entry.comments}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Recommendation and Notes</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Final Rating" value={interview.rating != null ? `${interview.rating}/5` : '-'} />
                <Field label="Recommendation" value={interview.recommendation?.replace(/_/g, ' ') || '-'} />
              </div>
              <div className="mt-3">
                <Field label="Interview Notes" value={interview.feedback || '-'} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Assessment Results</p>
              {!workspaces.find((workspace) => workspace.application.id === interview.application.id)?.assessments.length ? (
                <p className="text-sm text-muted-foreground">No assessments linked to this application.</p>
              ) : (
                <div className="space-y-2">
                  {workspaces.find((workspace) => workspace.application.id === interview.application.id)?.assessments.slice(0, 3).map((assessment) => (
                    <div key={assessment.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{assessment.title}</p>
                        <p className="text-xs text-muted-foreground">{assessment.result || assessment.status}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-foreground">{assessment.score != null ? `${assessment.score}/${assessment.max_score}` : '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">History and Attachments</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Created by {interview.created_by_email || 'Recruitment team'}</p>
                {interview.rescheduled_from_id && <p>Rescheduled from an earlier interview round.</p>}
                {interview.cancelled_at && <p>Cancelled on {formatDateTime(interview.cancelled_at)}</p>}
                <p className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {resumes.length} resume attachment{resumes.length === 1 ? '' : 's'} in candidate documents</p>
              </div>
            </div>
          </div>
          <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
            {['scheduled', 'rescheduled'].includes(interview.status) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => onReschedule(interview)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /> Reschedule</button>
                <button onClick={() => onFeedback(interview)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"><MessageSquare className="h-3.5 w-3.5" /> Scorecard</button>
                <button onClick={() => onComplete(interview)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</button>
                <button onClick={() => onCancel(interview)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><XCircle className="h-3.5 w-3.5" /> Cancel</button>
              </div>
            )}
          </Can>
        </div>
      ))}
    </div>
  );
}

function AssessmentPanel({ workspaces }: { workspaces: ApplicationWorkspace[] }) {
  const assessments = workspaces.flatMap((workspace) => workspace.assessments.map((assessment) => ({ ...assessment, application: workspace.application })));
  const evaluations = workspaces.flatMap((workspace) => workspace.evaluations.map((evaluation) => ({ ...evaluation, application: workspace.application })));

  if (!assessments.length && !evaluations.length) return <EmptyState label="No assessment or evaluation results have been recorded." />;

  return (
    <div className="space-y-5">
      {!!assessments.length && (
        <div>
          <h3 className="mb-3 text-base font-bold text-foreground">Assessments</h3>
          <div className="space-y-3">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{assessment.title}</p>
                    <p className="text-sm text-muted-foreground">{assessment.application.job_title} - {assessment.assessment_type}</p>
                  </div>
                  <MiniPill value={assessment.status} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label="Assigned" value={formatDate(assessment.assigned_at)} />
                  <Field label="Due" value={formatDate(assessment.due_at)} />
                  <Field label="Score" value={assessment.score != null ? `${assessment.score}/${assessment.max_score}` : '-'} />
                  <Field label="Result" value={assessment.result || '-'} />
                </div>
                {assessment.evaluation_notes && <p className="mt-3 text-sm text-muted-foreground">{assessment.evaluation_notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!!evaluations.length && (
        <div>
          <h3 className="mb-3 text-base font-bold text-foreground">Evaluations</h3>
          <div className="space-y-3">
            {evaluations.map((evaluation) => (
              <div key={evaluation.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold capitalize text-foreground">{evaluation.evaluation_type.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-muted-foreground">{evaluation.application.job_title} - {evaluation.reviewer_email || 'Reviewer'}</p>
                  </div>
                  <MiniPill value={evaluation.recommendation} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Overall Rating" value={evaluation.overall_rating != null ? `${evaluation.overall_rating}/5` : '-'} />
                  <Field label="Created" value={formatDate(evaluation.created_at)} />
                  <Field label="Criteria" value={evaluation.ratings?.length || 0} />
                </div>
                {evaluation.strengths && <p className="mt-3 text-sm text-muted-foreground">Strengths: {evaluation.strengths}</p>}
                {evaluation.concerns && <p className="text-sm text-muted-foreground">Concerns: {evaluation.concerns}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommunicationsPanel({
  workspaces,
  templates,
  onSaved,
}: {
  workspaces: ApplicationWorkspace[];
  templates: CommunicationTemplate[];
  onSaved: () => Promise<void>;
}) {
  const communications = workspaces.flatMap((workspace) => workspace.communications.map((item) => ({ ...item, application: workspace.application })));
  const applications = workspaces.map((workspace) => workspace.application);
  const defaultApplicationId = applications[0]?.id || '';
  const [applicationId, setApplicationId] = useState(defaultApplicationId);
  const [channel, setChannel] = useState<CandidateCommunication['channel']>('email');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!applicationId && defaultApplicationId) setApplicationId(defaultApplicationId);
  }, [applicationId, defaultApplicationId]);

  useEffect(() => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
  }, [templateId, templates]);

  const selectedApplication = applications.find((item) => item.id === applicationId);
  const canSubmit = !!applicationId && !!subject.trim() && !!body.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await applicationsApi.communications.send(applicationId, {
        channel,
        template_id: templateId || undefined,
        subject,
        body,
      });
      setTemplateId('');
      setSubject('');
      setBody('');
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Compose or log communication</p>
            <p className="mt-1 text-xs text-muted-foreground">Email is sent through the existing email service. SMS, WhatsApp, phone notes, and internal notes are recorded in the ATS timeline.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Application</label>
              <select value={applicationId} onChange={(event) => setApplicationId(event.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                {applications.map((application) => (
                  <option key={application.id} value={application.id}>{application.job_title || 'Application'}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Template</label>
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">Start blank</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {COMMUNICATION_CHANNELS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setChannel(value)}
                className={cn(
                  'flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold',
                  channel === value ? 'border-primary bg-primary text-white' : 'border-border bg-white text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            {COMMUNICATION_CHANNELS.find((item) => item.value === channel)?.description}
            {selectedApplication?.candidate_email && channel === 'email' ? `: ${selectedApplication.candidate_email}` : ''}
            {selectedApplication?.candidate_phone && ['sms', 'whatsapp', 'phone_note'].includes(channel) ? `: ${selectedApplication.candidate_phone}` : ''}
          </div>

          <div className="space-y-2">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={channel === 'phone_note' ? 'Call summary' : channel === 'internal_note' ? 'Internal note title' : 'Subject'}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Use {{candidate_name}}, {{job_title}}, and {{company_name}} in templates."
              rows={8}
              className="w-full resize-none rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button onClick={submit} disabled={!canSubmit || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {channel === 'email' ? 'Send Email' : 'Save to Timeline'}
          </button>
        </div>
      </Can>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Conversation history</p>
          <p className="text-xs text-muted-foreground">{communications.length} entries</p>
        </div>
        {!communications.length ? <EmptyState label="No communication history has been recorded for this candidate." /> : communications
          .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
          .map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{item.subject}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{communicationChannelLabel(item.channel)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.application.job_title} - {item.sent_by_email || 'System'}</p>
                </div>
                <MiniPill value={item.status} />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
              {item.error_message && <p className="mt-2 text-xs text-red-600">{item.error_message}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(parseISO(item.sent_at), { addSuffix: true })}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

function OffersPanel({ workspaces }: { workspaces: ApplicationWorkspace[] }) {
  const offers = workspaces.flatMap((workspace) => workspace.offers.map((offer) => ({ ...offer, application: workspace.application })));
  if (!offers.length) return <EmptyState label="No offers have been created for this candidate." />;

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <Link key={offer.id} href={`/dashboard/hr/recruitment/offers/${offer.id}`} className="block rounded-lg border border-border p-4 hover:bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">{offer.designation || offer.job_title || offer.application.job_title}</p>
              <p className="text-sm text-muted-foreground">{offer.application.job_title}</p>
            </div>
            <MiniPill value={offer.status} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
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

function PreboardingPanel({ workspaces, onSaved }: { workspaces: ApplicationWorkspace[]; onSaved: () => void }) {
  const items = workspaces.filter((workspace) => workspace.preboarding);
  if (!items.length) return <EmptyState label="No preboarding checklist has been started for this candidate." />;

  return (
    <div className="space-y-4">
      {items.map(({ application, preboarding, preboardingDocuments }) => {
        const checklist = preboarding!;
        return (
          <div key={application.id} className="space-y-3">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">{application.job_title}</p>
                <p className="text-sm text-muted-foreground">Joining {formatDate(checklist.joining_date)} - {preboardingDocuments.length} document{preboardingDocuments.length === 1 ? '' : 's'} collected</p>
              </div>
              <MiniPill value={checklist.status} />
            </div>
            <PreboardingChecklistCard applicationId={application.id} checklist={checklist} onSaved={onSaved} />
          </div>
        );
      })}
    </div>
  );
}

function DocumentsPanel({ candidateId, resumes, workspaces }: { candidateId: string; resumes: any[]; workspaces: ApplicationWorkspace[] }) {
  const docs = workspaces.flatMap((workspace) => workspace.preboardingDocuments.map((doc) => ({ ...doc, application: workspace.application })));
  return (
    <div className="space-y-5">
      <CandidateResumes candidateId={candidateId} />
      <div>
        <h3 className="mb-3 text-base font-bold text-foreground">Preboarding Documents</h3>
        {!docs.length ? <EmptyState label="No preboarding documents are available yet." /> : (
          <div className="space-y-2">
            {docs.map((doc, index) => (
              <div key={doc.id || index} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{doc.name || doc.file_name || doc.document_type || 'Document'}</p>
                  <p className="text-xs text-muted-foreground">{doc.application.job_title}</p>
                </div>
                <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-3 text-base font-bold text-foreground">Resume Snapshot</h3>
        {!resumes.length ? <EmptyState label="No resume versions uploaded." /> : (
          <div className="space-y-2">
            {resumes.map((resume, index) => (
              <div key={resume.id || index} className="rounded-lg bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{resume.name || 'Resume'}</p>
                <p className="text-xs text-muted-foreground">{index === 0 ? 'Current resume' : 'Previous version'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelinePanel({ candidate, workspaces }: { candidate: Candidate; workspaces: ApplicationWorkspace[] }) {
  const items = buildTimeline(candidate, workspaces);
  if (!items.length) return <EmptyState label="No candidate timeline is available yet." />;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="relative border-l border-border pl-4">
          <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-primary" />
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.context} - {formatDistanceToNow(parseISO(item.date), { addSuffix: true })}</p>
          {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </div>
  );
}

function buildTimeline(candidate: Candidate, workspaces: ApplicationWorkspace[]) {
  const items: Array<{ id: string; date: string; title: string; context: string; detail?: string | null }> = [
    { id: `candidate-${candidate.id}`, date: candidate.created_at, title: 'Candidate profile created', context: 'Profile' },
  ];

  for (const workspace of workspaces) {
    const app = workspace.application;
    items.push({ id: `app-${app.id}`, date: app.applied_at, title: `Applied for ${app.job_title}`, context: 'Application', detail: app.cover_note });
    workspace.stageHistory.forEach((stage) => {
      items.push({
        id: `stage-${stage.id}`,
        date: stage.created_at,
        title: `${stage.from_stage_name || 'Not staged'} to ${stage.to_stage_name || 'Not staged'}`,
        context: app.job_title || 'Application',
        detail: stage.comment,
      });
    });
    workspace.interviews.forEach((interview) => {
      items.push({
        id: `interview-${interview.id}`,
        date: interview.scheduled_at,
        title: `Interview ${interview.status.replace(/_/g, ' ')}`,
        context: app.job_title || 'Interview',
        detail: `Round ${interview.round_number} - ${interview.round_type}`,
      });
    });
    workspace.assessments.forEach((assessment) => {
      items.push({
        id: `assessment-${assessment.id}`,
        date: assessment.evaluated_at || assessment.assigned_at,
        title: `Assessment ${assessment.status.replace(/_/g, ' ')}`,
        context: app.job_title || 'Assessment',
        detail: assessment.title,
      });
    });
    workspace.offers.forEach((offer) => {
      items.push({
        id: `offer-${offer.id}`,
        date: offer.updated_at || offer.created_at,
        title: `Offer ${offer.status.replace(/_/g, ' ')}`,
        context: app.job_title || 'Offer',
        detail: offer.ctc != null ? `${offer.currency} ${offer.ctc.toLocaleString()}` : null,
      });
    });
    workspace.communications.forEach((communication) => {
      items.push({
        id: `comm-${communication.id}`,
        date: communication.sent_at,
        title: communication.subject,
        context: `${communicationChannelLabel(communication.channel)} - ${communication.status}`,
        detail: communication.body,
      });
    });
    if (workspace.preboarding) {
      items.push({
        id: `preboarding-${workspace.preboarding.id}`,
        date: workspace.preboarding.updated_at,
        title: `Preboarding ${workspace.preboarding.status.replace(/_/g, ' ')}`,
        context: app.job_title || 'Preboarding',
      });
    }
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function loadApplicationWorkspace(application: Application): Promise<ApplicationWorkspace> {
  const [
    interviewResult,
    assessments,
    evaluations,
    communications,
    stageHistory,
    offerResult,
    preboarding,
    preboardingDocuments,
  ] = await Promise.all([
    interviewsApi.list({ application_id: application.id, limit: 100 }).then((result) => result.data).catch(() => []),
    applicationsApi.assessments.list(application.id).catch(() => []),
    applicationsApi.evaluations.list(application.id).catch(() => []),
    applicationsApi.communications.list(application.id).catch(() => []),
    applicationsApi.stageHistory(application.id).catch(() => []),
    offersApi.list({ application_id: application.id, limit: 100 }).then((result) => result.data).catch(() => []),
    preboardingApi.get(application.id).catch(() => null),
    preboardingApi.listDocuments(application.id).catch(() => []),
  ]);

  return {
    application,
    interviews: interviewResult,
    assessments,
    evaluations,
    communications,
    stageHistory,
    offers: offerResult,
    preboarding,
    preboardingDocuments,
  };
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [workspace, setWorkspace] = useState<CandidateWorkspaceData>({ applications: [], appWorkspaces: [], resumes: [] });
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('profile');
  const [tagsText, setTagsText] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const [communicationTemplates, setCommunicationTemplates] = useState<CommunicationTemplate[]>([]);
  const [scheduleApplicationId, setScheduleApplicationId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Interview | null>(null);

  const load = async () => {
    setLoading(true);
    setWorkspaceLoading(true);
    try {
      const [candidateResult, applicationResult, resumes] = await Promise.all([
        candidatesApi.get(id),
        candidatesApi.applications(id),
        candidatesApi.resumes.list(id).catch(() => []),
      ]);

      setCandidate(candidateResult);
      setTagsText((candidateResult.tags || []).join(', '));

      const appWorkspaces = await Promise.all(applicationResult.data.map(loadApplicationWorkspace));
      setWorkspace({ applications: applicationResult.data, appWorkspaces, resumes });
      setCommunicationTemplates(await communicationTemplatesApi.list().catch(() => []));
    } finally {
      setLoading(false);
      setWorkspaceLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const saveTags = async () => {
    setSavingTags(true);
    try {
      const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
      const updated = await candidatesApi.update(id, { tags } as any);
      setCandidate(updated);
      setTagsText((updated.tags || []).join(', '));
    } finally {
      setSavingTags(false);
    }
  };

  const updateStatus = async (appId: string, status: Application['status']) => {
    if (status === 'rejected') {
      const reason = window.prompt('Rejection reason (optional):') || undefined;
      await applicationsApi.updateStatus(appId, status, reason);
    } else {
      await applicationsApi.updateStatus(appId, status);
    }
    await load();
  };

  const completeInterview = async (interview: Interview) => {
    await interviewsApi.complete(interview.id, { feedback: window.prompt('Overall interview notes (optional):') || undefined });
    await load();
  };

  const cancelInterview = async (interview: Interview) => {
    await interviewsApi.cancel(interview.id, window.prompt('Cancellation reason (optional):') || undefined);
    await load();
  };

  const stats = useMemo(() => {
    const interviews = workspace.appWorkspaces.flatMap((item) => item.interviews);
    const offers = workspace.appWorkspaces.flatMap((item) => item.offers);
    return {
      activeApplications: workspace.applications.filter((item) => !['rejected', 'withdrawn', 'hired'].includes(item.status)).length,
      interviews: interviews.length,
      assessments: workspace.appWorkspaces.flatMap((item) => item.assessments).length,
      offers: offers.length,
      hired: workspace.applications.filter((item) => item.status === 'hired').length,
    };
  }, [workspace]);

  if (loading || !candidate) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const latestApplication = getLatestApplication(workspace.applications);
  const nextStep = getNextStep(workspace);

  return (
    <div className="space-y-5">
      {scheduleApplicationId && (
        <InterviewDrawer applicationId={scheduleApplicationId} onClose={() => setScheduleApplicationId(null)} onSaved={load} />
      )}
      {rescheduleTarget && (
        <InterviewDrawer rescheduling={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onSaved={load} />
      )}
      {feedbackTarget && (
        <InterviewFeedbackModal interview={feedbackTarget} onClose={() => setFeedbackTarget(null)} onSaved={load} />
      )}

      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <button onClick={() => router.push('/dashboard/hr/recruitment/candidates')} className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{candidateName(candidate)}</h1>
                {latestApplication && <StatusPill value={latestApplication.status} />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {candidate.email} {candidate.phone ? `- ${candidate.phone}` : ''}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {candidate.current_designation || 'No current role'} {candidate.current_company ? `at ${candidate.current_company}` : ''} - {candidate.experience_years ?? 0} yrs experience
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:w-[30rem]">
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : workspace.applications.length}</p>
              <p className="text-[11px] text-muted-foreground">Apps</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : stats.interviews}</p>
              <p className="text-[11px] text-muted-foreground">Interviews</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : stats.assessments}</p>
              <p className="text-[11px] text-muted-foreground">Tests</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : stats.offers}</p>
              <p className="text-[11px] text-muted-foreground">Offers</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{workspaceLoading ? '...' : stats.hired}</p>
              <p className="text-[11px] text-muted-foreground">Hired</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">Next step: {nextStep.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{nextStep.description}</p>
            <button onClick={() => setActiveTab(nextStep.target)} className="mt-3 text-sm font-medium text-primary hover:underline">
              Open {WORKSPACE_TABS.find((tab) => tab.key === nextStep.target)?.label}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
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

      {workspaceLoading && activeTab !== 'profile' && (
        <div className="flex items-center justify-center rounded-lg border border-border bg-white py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Applications" value={workspace.applications.length} sub="Across vacancies" icon={Briefcase} />
            <MetricCard label="Active Applications" value={stats.activeApplications} sub="Still in play" icon={UserCheck} />
            <MetricCard label="Interviews" value={stats.interviews} sub="All interview rounds" icon={Calendar} />
            <MetricCard label="Assessments" value={stats.assessments} sub="Assigned and evaluated" icon={FileCheck2} />
            <MetricCard label="Offers" value={stats.offers} sub="Draft to final response" icon={FileSignature} />
          </div>
          <Section title="Profile" icon={User}>
            <ProfilePanel candidate={candidate} />
          </Section>
        </div>
      )}

      {activeTab === 'resume' && (
        <Section title="Resume" icon={FileText}>
          <CandidateResumes candidateId={candidate.id} />
        </Section>
      )}

      {activeTab === 'timeline' && !workspaceLoading && (
        <Section title="Timeline" icon={History}>
          <TimelinePanel candidate={candidate} workspaces={workspace.appWorkspaces} />
        </Section>
      )}

      {activeTab === 'applications' && !workspaceLoading && (
        <Section title="Applications" icon={Briefcase}>
          <ApplicationsPanel applications={workspace.applications} onUpdateStatus={updateStatus} />
        </Section>
      )}

      {activeTab === 'documents' && !workspaceLoading && (
        <Section title="Documents" icon={FileArchive}>
          <DocumentsPanel candidateId={candidate.id} resumes={workspace.resumes} workspaces={workspace.appWorkspaces} />
        </Section>
      )}

      {activeTab === 'interviews' && !workspaceLoading && (
        <Section title="Interview Management" icon={Calendar}>
          <InterviewsPanel
            workspaces={workspace.appWorkspaces}
            resumes={workspace.resumes}
            onSchedule={setScheduleApplicationId}
            onReschedule={setRescheduleTarget}
            onFeedback={setFeedbackTarget}
            onComplete={completeInterview}
            onCancel={cancelInterview}
          />
        </Section>
      )}

      {activeTab === 'assessments' && !workspaceLoading && (
        <Section title="Assessment Results" icon={FileCheck2}>
          <AssessmentPanel workspaces={workspace.appWorkspaces} />
        </Section>
      )}

      {activeTab === 'communications' && !workspaceLoading && (
        <Section title="Communication Workspace" icon={MessageSquare}>
          <CommunicationsPanel workspaces={workspace.appWorkspaces} templates={communicationTemplates} onSaved={load} />
        </Section>
      )}

      {activeTab === 'tags' && (
        <Section title="Tags" icon={Tags}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(candidate.tags || []).length ? candidate.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{tag}</span>
              )) : <p className="text-sm text-muted-foreground">No tags assigned yet.</p>}
            </div>
            <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Edit tags</label>
                <input
                  value={tagsText}
                  onChange={(event) => setTagsText(event.target.value)}
                  placeholder="frontend, senior, relocation"
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button onClick={saveTags} disabled={savingTags} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                  {savingTags ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Tags
                </button>
              </div>
            </Can>
          </div>
        </Section>
      )}

      {activeTab === 'offers' && !workspaceLoading && (
        <Section title="Offers" icon={FileSignature}>
          <OffersPanel workspaces={workspace.appWorkspaces} />
        </Section>
      )}

      {activeTab === 'preboarding' && !workspaceLoading && (
        <Section title="Preboarding Status" icon={ClipboardCheck}>
          <PreboardingPanel workspaces={workspace.appWorkspaces} onSaved={load} />
        </Section>
      )}

      {activeTab === 'activity' && !workspaceLoading && (
        <Section title="Activity Timeline" icon={GitBranch}>
          <TimelinePanel candidate={candidate} workspaces={workspace.appWorkspaces} />
        </Section>
      )}
    </div>
  );
}
