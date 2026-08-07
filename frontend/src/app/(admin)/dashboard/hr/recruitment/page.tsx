'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDays,
  format,
  formatDistanceToNow,
  isSameDay,
  parseISO,
  startOfToday,
} from 'date-fns';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileText,
  GitBranch,
  HelpCircle,
  ListChecks,
  Megaphone,
  Plus,
  Send,
  ShieldAlert,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wand2,
} from 'lucide-react';
import api from '@/lib/api';
import { notificationsApi, type NotificationItem } from '@/lib/notifications-api';
import { cn } from '@/lib/utils';

interface DashboardOverview {
  open_vacancies: number;
  awaiting_approval: Record<string, number>;
  pipeline_counts: Record<string, number>;
  upcoming_interviews: Array<{
    id: string;
    application_id: string | null;
    scheduled_at: string;
    round_type: string;
    round_number: number;
    first_name: string;
    last_name: string;
    job_title: string;
  }>;
  offers_pending: { sent: number; pending_approval: number; accepted: number; declined: number };
  joining_schedule: Array<{
    application_id: string;
    joining_date: string;
    first_name: string;
    last_name: string;
    job_title: string;
  }>;
  recruiter_workload: Array<{
    recruiter_id: string;
    first_name: string;
    last_name: string;
    open_vacancies: number;
    active_applications: number;
  }>;
  dept_hiring_status: Array<{ department: string; open: number; on_hold: number; closed: number }>;
  hiring_funnel: {
    applied: number;
    under_review_plus: number;
    shortlisted: number;
    hired: number;
    rejected: number;
    withdrawn: number;
  };
  recent_activity: Array<{
    entity_type: string;
    action: string;
    entity_id: string;
    created_at: string;
    actor_email: string | null;
  }>;
  kpis: {
    avg_time_to_hire_days: number | null;
    avg_decision_days: number | null;
    offer_acceptance_rate: number | null;
  };
  analytics?: {
    hiring_funnel: {
      applied: number;
      under_review_plus: number;
      shortlisted: number;
      hired: number;
      rejected: number;
      withdrawn: number;
    };
    time_to_hire_days: number | null;
    time_per_stage: Array<{ stage: string; category: string; transitions: number; avg_days: number | null }>;
    offer_acceptance: { responded_offers: number; accepted_offers: number; acceptance_rate: number | null };
    joining_ratio: { accepted_offers: number; joined: number; ratio: number | null };
    recruiter_performance: Array<{
      recruiter_id: string | null;
      recruiter_name: string;
      vacancies: number;
      closed_vacancies: number;
      candidates: number;
      hires: number;
      offers: number;
      accepted_offers: number;
      hire_rate: number | null;
      avg_time_to_hire_days: number | null;
    }>;
    source_effectiveness: Array<{
      source: string;
      applications: number;
      shortlisted: number;
      hires: number;
      accepted_offers: number;
      conversion_rate: number | null;
    }>;
    vacancy_analytics: Array<{
      id: string;
      title: string;
      department: string;
      status: string;
      number_of_positions: number;
      applications: number;
      shortlisted: number;
      hires: number;
      accepted_offers: number;
      avg_time_to_hire_days: number | null;
    }>;
    candidate_conversion: {
      applications: number;
      moved_forward: number;
      shortlisted: number;
      offered: number;
      offer_accepted: number;
      hired: number;
      joined: number;
      candidate_to_hire_rate: number | null;
      accepted_to_joined_rate: number | null;
    };
    monthly_trend: Array<{ month: string; applications: number; hires: number; joined: number }>;
  };
}

const QUICK_ACTIONS = [
  { label: 'Workforce Plan', href: '/dashboard/hr/recruitment/workforce-planning', icon: ClipboardCheck },
  { label: 'Create Vacancy', href: '/dashboard/hr/recruitment/vacancies', icon: Briefcase },
  { label: 'Create Job Description', href: '/dashboard/hr/recruitment/job-descriptions', icon: FileText },
  { label: 'Publish Jobs', href: '/dashboard/hr/recruitment/job-descriptions', icon: Megaphone },
  { label: 'Interview Queue', href: '/dashboard/hr/recruitment/interviews', icon: Calendar },
  { label: 'View Pipeline', href: '/dashboard/hr/recruitment/pipeline', icon: GitBranch },
  { label: 'Create Offer', href: '/dashboard/hr/recruitment/offers', icon: FileSignature },
  { label: 'View Candidates', href: '/dashboard/hr/recruitment/candidates', icon: Users },
];

const FUNNEL_STAGES: Array<{ key: keyof DashboardOverview['hiring_funnel']; label: string; tone: string }> = [
  { key: 'applied', label: 'Applied', tone: 'bg-blue-500' },
  { key: 'under_review_plus', label: 'Review', tone: 'bg-amber-500' },
  { key: 'shortlisted', label: 'Shortlist', tone: 'bg-teal-500' },
  { key: 'hired', label: 'Hired', tone: 'bg-emerald-500' },
];

const WORKFLOW_STAGES = [
  {
    label: 'Workforce Planning',
    href: '/dashboard/hr/recruitment/workforce-planning',
    icon: ClipboardCheck,
    description: 'Plan headcount and get hiring budget approved.',
  },
  {
    label: 'Vacancies',
    href: '/dashboard/hr/recruitment/vacancies',
    icon: Briefcase,
    description: 'Create hiring requests and move approved roles into action.',
  },
  {
    label: 'Job Descriptions',
    href: '/dashboard/hr/recruitment/job-descriptions',
    icon: FileText,
    description: 'Define responsibilities, skills, and approval-ready role details.',
  },
  {
    label: 'Publishing',
    href: '/dashboard/hr/recruitment/job-descriptions',
    icon: Megaphone,
    description: 'Publish approved descriptions to collect applications.',
  },
  {
    label: 'Applications',
    href: '/dashboard/hr/recruitment/candidates',
    icon: Users,
    description: 'Capture candidates and attach them to open jobs.',
  },
  {
    label: 'Pipeline',
    href: '/dashboard/hr/recruitment/pipeline',
    icon: GitBranch,
    description: 'Screen, shortlist, and move candidates through hiring stages.',
  },
  {
    label: 'Interviews',
    href: '/dashboard/hr/recruitment/interviews',
    icon: Calendar,
    description: 'Schedule rounds, collect feedback, and close decisions.',
  },
  {
    label: 'Offers',
    href: '/dashboard/hr/recruitment/offers',
    icon: FileSignature,
    description: 'Prepare, approve, send, and track candidate responses.',
  },
  {
    label: 'Onboarding',
    href: '/dashboard/hr/recruitment/onboarding',
    icon: UserCheck,
    description: 'Finish joining documents and preboarding tasks.',
  },
  {
    label: 'Employee Conversion',
    href: '/dashboard/hr/recruitment/onboarding',
    icon: CheckCircle2,
    description: 'Convert accepted, ready candidates into employees.',
  },
];

type StageStatus = 'completed' | 'active' | 'pending' | 'blocked' | 'empty';

const statusLabel: Record<StageStatus, string> = {
  completed: 'Completed',
  active: 'Active',
  pending: 'Pending',
  blocked: 'Blocked',
  empty: 'Empty',
};

const QUICK_START_STEPS = [
  {
    label: 'Create Workforce Plan',
    description: 'Start with approved hiring demand so recruiters know what to fill.',
    href: '/dashboard/hr/recruitment/workforce-planning',
  },
  {
    label: 'Create Vacancy',
    description: 'Turn a planned hire into a trackable vacancy with owner, department, and target date.',
    href: '/dashboard/hr/recruitment/vacancies',
  },
  {
    label: 'Approve Vacancy',
    description: 'Send the vacancy through the approval inbox before publishing.',
    href: '/dashboard/approvals',
  },
  {
    label: 'Create Job Description',
    description: 'Add role summary, skills, responsibilities, benefits, and approval notes.',
    href: '/dashboard/hr/recruitment/job-descriptions',
  },
  {
    label: 'Approve Job Description',
    description: 'Make sure the description is approved before recruiters publish it.',
    href: '/dashboard/approvals',
  },
  {
    label: 'Publish Job',
    description: 'Open the role internally or externally so applications can arrive.',
    href: '/dashboard/hr/recruitment/job-descriptions',
  },
  {
    label: 'Review Candidates',
    description: 'Attach candidates to applications and move qualified profiles into the pipeline.',
    href: '/dashboard/hr/recruitment/pipeline',
  },
  {
    label: 'Schedule Interviews',
    description: 'Plan rounds, assign panel members, and capture feedback after each interview.',
    href: '/dashboard/hr/recruitment/interviews',
  },
  {
    label: 'Create Offer',
    description: 'Prepare compensation, submit approval, and send the offer for response.',
    href: '/dashboard/hr/recruitment/offers',
  },
  {
    label: 'Convert Candidate',
    description: 'Complete onboarding checks and create the employee record.',
    href: '/dashboard/hr/recruitment/onboarding',
  },
];

const approvalLabels: Record<string, string> = {
  vacancies: 'Vacancies',
  job_descriptions: 'Job descriptions',
  offers: 'Offers',
  probation_reviews: 'Probation reviews',
  workforce_plans: 'Workforce plans',
};

function formatNumber(value: number | string | undefined, loading: boolean) {
  if (loading) return '...';
  return value ?? 0;
}

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTotal(values?: Record<string, number>) {
  return Object.values(values || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${toNumber(value)}%`;
}

function getStageStatuses(data: DashboardOverview | null): StageStatus[] {
  if (!data) return WORKFLOW_STAGES.map(() => 'empty');

  const approvals = data.awaiting_approval || {};
  const openVacancies = toNumber(data.open_vacancies);
  const pipelineTotal = Object.values(data.pipeline_counts || {}).reduce((sum, value) => sum + toNumber(value), 0);
  const applied = toNumber(data.hiring_funnel?.applied);
  const underReview = toNumber(data.hiring_funnel?.under_review_plus);
  const shortlisted = toNumber(data.hiring_funnel?.shortlisted);
  const hired = toNumber(data.hiring_funnel?.hired);
  const offersPending = toNumber(data.offers_pending?.sent) + toNumber(data.offers_pending?.pending_approval);
  const offersAccepted = toNumber(data.offers_pending?.accepted);
  const upcomingInterviews = data.upcoming_interviews?.length ?? 0;
  const joining = data.joining_schedule?.length ?? 0;
  const workforceApprovals = toNumber(approvals.workforce_plans);
  const vacancyApprovals = toNumber(approvals.vacancies);
  const jdApprovals = toNumber(approvals.job_descriptions);
  const offerApprovals = toNumber(approvals.offers);

  return [
    workforceApprovals > 0 ? 'active' : openVacancies > 0 || pipelineTotal > 0 ? 'completed' : 'empty',
    vacancyApprovals > 0 ? 'active' : openVacancies > 0 ? 'completed' : workforceApprovals > 0 ? 'pending' : 'empty',
    jdApprovals > 0 ? 'active' : openVacancies > 0 ? 'completed' : 'pending',
    jdApprovals > 0 ? 'blocked' : openVacancies > 0 ? 'active' : 'pending',
    applied > 0 ? 'active' : openVacancies > 0 ? 'pending' : 'empty',
    underReview + shortlisted > 0 ? 'active' : applied > 0 ? 'pending' : 'empty',
    upcomingInterviews > 0 ? 'active' : shortlisted > 0 ? 'pending' : 'empty',
    offerApprovals > 0 ? 'blocked' : offersPending > 0 ? 'active' : upcomingInterviews > 0 ? 'pending' : 'empty',
    joining > 0 ? 'active' : offersAccepted > 0 ? 'pending' : 'empty',
    hired > 0 ? 'completed' : joining > 0 ? 'pending' : 'empty',
  ];
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  href: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-4 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}

function MetricTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function RecruitmentWorkflowGuide() {
  const phases = [
    {
      title: 'Phase 1: Planning & Setup',
      steps: [
        '1. Create Workforce Plan (Optional)',
        '2. Create Vacancy',
        '3. Approve Vacancy',
        '4. Create Job Description',
        '5. Approve Job Description',
      ],
    },
    {
      title: 'Phase 2: Sourcing & Applications',
      steps: [
        '6. Publish to Career Portal',
        '7. Publish to External Job Boards',
        '8. Receive Candidate Applications',
      ],
    },
    {
      title: 'Phase 3: Interviews & Selection',
      steps: [
        '9. Review Candidates',
        '10. Move Candidates Through Pipeline',
        '11. Schedule Interviews',
        '12. Record Interview Feedback',
        '13. Select Candidate',
      ],
    },
    {
      title: 'Phase 4: Offer & Onboarding',
      steps: [
        '14. Create Offer',
        '15. Approve Offer',
        '16. Send Offer',
        '17. Candidate Accepts Offer',
        '18. Complete Onboarding',
        '19. Convert Candidate to Employee',
        '20. Close Vacancy',
      ],
    },
  ];

  return (
    <SectionCard title="End-to-End Recruitment Workflow" icon={Target}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {phases.map((phase, i) => (
          <div key={i} className="rounded-lg border border-border bg-muted/10 p-4">
            <h3 className="mb-3 text-sm font-bold text-foreground">{phase.title}</h3>
            <ul className="space-y-2">
              {phase.steps.map((step, j) => (
                <li key={j} className="flex items-start text-xs text-muted-foreground">
                  <span className="mr-2 mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">{title}</h2>
        </div>
        {action && (
          <Link href={action.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {action.label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-lg bg-muted/30 px-4 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 rounded-lg bg-muted/60 animate-pulse" />
      ))}
    </div>
  );
}

function QuickStartPanel({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const statuses = getStageStatuses(data);
  const completed = statuses.filter((status) => status === 'completed').length;
  const progress = loading ? 0 : Math.round((completed / WORKFLOW_STAGES.length) * 100);

  return (
    <SectionCard title="How Recruitment Works" icon={HelpCircle}>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-foreground">Workflow progress</span>
          <span className="font-semibold text-primary">{loading ? '...' : `${progress}%`}</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="space-y-2">
        {QUICK_START_STEPS.map((step, index) => {
          const relatedStatus = statuses[Math.min(index, statuses.length - 1)] || 'empty';
          const done = relatedStatus === 'completed';
          const active = relatedStatus === 'active' || relatedStatus === 'blocked';
          return (
            <div key={step.label} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary">Step {index + 1}</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{step.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                  done && 'bg-emerald-50 text-emerald-700',
                  active && 'bg-primary/10 text-primary',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}>
                  {done ? 'Done' : active ? 'Now' : 'Next'}
                </span>
              </div>
              <Link href={step.href} className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                Go to step
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function GuidedWorkflowPanel({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const statuses = getStageStatuses(data);
  const activeIndex = Math.max(statuses.findIndex((status) => status === 'active' || status === 'blocked' || status === 'pending'), 0);
  const current = WORKFLOW_STAGES[activeIndex] || WORKFLOW_STAGES[0];
  const next = WORKFLOW_STAGES[Math.min(activeIndex + 1, WORKFLOW_STAGES.length - 1)];
  const CurrentIcon = current.icon;

  return (
    <SectionCard title="Guided Hiring Wizard" icon={Wand2}>
      {loading ? <LoadingRows rows={3} /> : (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary">
                <CurrentIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Current recommended step</p>
                <h3 className="mt-1 text-base font-bold text-foreground">{current.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={current.href} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={next.href} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                Next: {next.label}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {WORKFLOW_STAGES.slice(Math.max(activeIndex - 1, 0), activeIndex + 3).map((stage, index) => {
              const stageIndex = WORKFLOW_STAGES.findIndex((item) => item.label === stage.label);
              const status = statuses[stageIndex] || 'empty';
              return (
                <Link key={stage.label} href={stage.href} className="rounded-lg border border-border p-3 hover:bg-muted/30">
                  <p className="text-[11px] font-semibold text-muted-foreground">{index === 0 && activeIndex > 0 ? 'Previous' : stageIndex === activeIndex ? 'Now' : 'Next'}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">{stage.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{statusLabel[status]}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ActionCards({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const today = startOfToday();
  const todaysInterviews = data?.upcoming_interviews.filter((item) => {
    const date = safeDate(item.scheduled_at);
    return date ? isSameDay(date, today) : false;
  }).length ?? 0;
  const pendingApprovals = getTotal(data?.awaiting_approval);
  const candidatesWaiting = toNumber(data?.pipeline_counts?.applied) + toNumber(data?.pipeline_counts?.under_review);
  const pendingOffers = toNumber(data?.offers_pending?.sent) + toNumber(data?.offers_pending?.pending_approval);
  const joiningToday = data?.joining_schedule.filter((item) => {
    const date = safeDate(item.joining_date);
    return date ? isSameDay(date, today) : false;
  }).length ?? 0;

  const cards = [
    { label: "Today's Interviews", value: todaysInterviews, href: '/dashboard/hr/recruitment/interviews', icon: Calendar, action: 'Review schedule' },
    { label: 'Pending Offers', value: pendingOffers, href: '/dashboard/hr/recruitment/offers', icon: FileSignature, action: 'Open offers' },
    { label: 'Pending Approvals', value: pendingApprovals, href: '/dashboard/approvals', icon: ClipboardCheck, action: 'Open inbox' },
    { label: 'Candidates Waiting', value: candidatesWaiting, href: '/dashboard/hr/recruitment/pipeline', icon: Users, action: 'Screen candidates' },
    { label: 'Background Checks', value: toNumber(data?.hiring_funnel?.shortlisted), href: '/dashboard/hr/recruitment/pipeline', icon: ShieldAlert, action: 'Check readiness' },
    { label: 'Joining Today', value: joiningToday, href: '/dashboard/hr/recruitment/onboarding', icon: UserCheck, action: 'Start onboarding' },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map(({ label, value, href, icon: Icon, action }) => (
        <Link key={label} href={href} className="rounded-lg border border-border bg-white p-4 shadow-sm hover:bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <Icon className="h-4 w-4 text-primary" />
            <span className="text-xl font-bold text-foreground">{loading ? '...' : value}</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{action}</p>
        </Link>
      ))}
    </div>
  );
}

function SmartWarnings({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  if (loading) return <LoadingRows rows={2} />;

  const warnings = [
    {
      show: toNumber(data?.awaiting_approval?.job_descriptions) > 0,
      title: 'Job Description Not Approved',
      detail: 'Publishing is blocked until pending job descriptions are approved.',
      href: '/dashboard/approvals',
    },
    {
      show: toNumber(data?.awaiting_approval?.offers) > 0,
      title: 'Offer Waiting for Approval',
      detail: 'Approved offers can be sent to candidates for response.',
      href: '/dashboard/approvals',
    },
    {
      show: (data?.upcoming_interviews ?? []).some((interview) => {
        const date = safeDate(interview.scheduled_at);
        return date ? date.getTime() < Date.now() : false;
      }),
      title: 'Interview Feedback Pending',
      detail: 'Some scheduled interviews have passed and need feedback or completion.',
      href: '/dashboard/hr/recruitment/interviews',
    },
    {
      show: toNumber(data?.open_vacancies) === 0,
      title: 'No Open Vacancies',
      detail: 'Create or approve a vacancy before publishing roles and receiving applications.',
      href: '/dashboard/hr/recruitment/vacancies',
    },
  ].filter((warning) => warning.show);

  if (!warnings.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">No major blockers detected</p>
            <p className="mt-1 text-xs text-emerald-700">Recruitment workflow checks look clear based on the dashboard data.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <Link key={warning.title} href={warning.href} className="block rounded-lg border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100/70">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">{warning.title}</p>
              <p className="mt-1 text-xs text-amber-800">{warning.detail}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function NextActions({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const statuses = getStageStatuses(data);
  const activeIndex = Math.max(statuses.findIndex((status) => status === 'active' || status === 'blocked' || status === 'pending'), 0);
  const primary = WORKFLOW_STAGES[activeIndex] || WORKFLOW_STAGES[0];
  const actions = [
    {
      title: `${primary.label} needs attention`,
      detail: primary.description,
      href: primary.href,
      icon: ArrowRight,
    },
    {
      title: toNumber(data?.awaiting_approval?.vacancies) > 0 ? 'Vacancy awaiting approval' : 'Keep candidates moving',
      detail: toNumber(data?.awaiting_approval?.vacancies) > 0 ? 'Open the approval inbox before publishing.' : 'Review new applications and move qualified candidates forward.',
      href: toNumber(data?.awaiting_approval?.vacancies) > 0 ? '/dashboard/approvals' : '/dashboard/hr/recruitment/pipeline',
      icon: ClipboardCheck,
    },
    {
      title: toNumber(data?.offers_pending?.accepted) > 0 ? 'Offer accepted' : 'Prepare offer actions',
      detail: toNumber(data?.offers_pending?.accepted) > 0 ? 'Start onboarding for accepted candidates.' : 'Create offers after interviews are completed.',
      href: toNumber(data?.offers_pending?.accepted) > 0 ? '/dashboard/hr/recruitment/onboarding' : '/dashboard/hr/recruitment/offers',
      icon: FileSignature,
    },
  ];

  return (
    <SectionCard title="Suggested Next Actions" icon={ArrowRight}>
      {loading ? <LoadingRows rows={3} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {actions.map(({ title, detail, href, icon: Icon }) => (
            <Link key={title} href={href} className="rounded-lg border border-border p-3 hover:bg-muted/30">
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PersonInitials({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {firstName.slice(0, 1)}
      {lastName.slice(0, 1)}
    </div>
  );
}

function TodayInterviews({ items, loading }: { items: DashboardOverview['upcoming_interviews']; loading: boolean }) {
  const today = startOfToday();
  const todaysInterviews = items.filter((item) => {
    const date = safeDate(item.scheduled_at);
    return date ? isSameDay(date, today) : false;
  });

  if (loading) return <LoadingRows rows={3} />;
  if (!todaysInterviews.length) return <EmptyState label="No interviews scheduled for today" />;

  return (
    <div className="space-y-3">
      {todaysInterviews.slice(0, 5).map((interview) => {
        const date = safeDate(interview.scheduled_at);
        return (
          <Link
            key={interview.id}
            href={interview.application_id ? `/dashboard/hr/recruitment/pipeline/${interview.application_id}` : '/dashboard/hr/recruitment/interviews'}
            className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 hover:bg-muted"
          >
            <div className="flex min-w-0 items-center gap-3">
              <PersonInitials firstName={interview.first_name} lastName={interview.last_name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {interview.first_name} {interview.last_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {interview.job_title} - Round {interview.round_number} ({interview.round_type})
                </p>
              </div>
            </div>
            <p className="shrink-0 text-xs font-medium text-foreground">{date ? format(date, 'h:mm a') : 'TBD'}</p>
          </Link>
        );
      })}
    </div>
  );
}

function PipelineSummary({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  if (loading) return <LoadingRows rows={4} />;
  if (!data?.hiring_funnel) return <EmptyState label="No candidates in the pipeline yet" />;

  const max = Math.max(...FUNNEL_STAGES.map((stage) => Number(data.hiring_funnel[stage.key]) || 0), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {FUNNEL_STAGES.map((stage) => {
          const value = Number(data.hiring_funnel[stage.key]) || 0;
          return (
            <div key={stage.key} className="flex min-h-32 flex-col justify-end gap-2">
              <p className="text-center text-sm font-bold text-foreground">{value}</p>
              <div className="flex h-20 items-end rounded-lg bg-muted/50">
                <div
                  className={`w-full rounded-b-lg rounded-t-md ${stage.tone}`}
                  style={{ height: `${Math.max((value / max) * 100, value ? 12 : 0)}%` }}
                />
              </div>
              <p className="truncate text-center text-xs text-muted-foreground">{stage.label}</p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-red-50 p-3 text-red-700">
          <span className="font-semibold">{data.hiring_funnel.rejected}</span> rejected
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
          <span className="font-semibold">{data.hiring_funnel.withdrawn}</span> withdrawn
        </div>
      </div>
    </div>
  );
}

function AnalyticsMetric({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function BarList({
  rows,
  valueKey,
  labelKey,
  detail,
  emptyLabel,
}: {
  rows: any[];
  valueKey: string;
  labelKey: string;
  detail?: (row: any) => string;
  emptyLabel: string;
}) {
  if (!rows.length) return <EmptyState label={emptyLabel} />;
  const max = Math.max(...rows.map((row) => toNumber(row[valueKey])), 1);

  return (
    <div className="space-y-3">
      {rows.slice(0, 6).map((row, index) => {
        const value = toNumber(row[valueKey]);
        return (
          <div key={`${row[labelKey] ?? index}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-foreground">{row[labelKey] || 'Unassigned'}</p>
              <p className="shrink-0 text-xs font-semibold text-foreground">{value}</p>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((value / max) * 100, value ? 8 : 0)}%` }} />
            </div>
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail(row)}</p>}
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsFunnel({ analytics }: { analytics: NonNullable<DashboardOverview['analytics']> }) {
  const conversion = analytics.candidate_conversion;
  const stages = [
    { label: 'Applied', value: conversion?.applications, tone: 'bg-blue-500' },
    { label: 'Moved', value: conversion?.moved_forward, tone: 'bg-sky-500' },
    { label: 'Shortlisted', value: conversion?.shortlisted, tone: 'bg-teal-500' },
    { label: 'Offered', value: conversion?.offered, tone: 'bg-amber-500' },
    { label: 'Accepted', value: conversion?.offer_accepted, tone: 'bg-lime-600' },
    { label: 'Joined', value: conversion?.joined, tone: 'bg-emerald-600' },
  ];
  const max = Math.max(...stages.map((stage) => toNumber(stage.value)), 1);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {stages.map((stage) => {
        const value = toNumber(stage.value);
        return (
          <div key={stage.label} className="rounded-lg bg-muted/30 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-muted-foreground">{stage.label}</p>
              <p className="text-sm font-bold text-foreground">{value}</p>
            </div>
            <div className="h-16 rounded-lg bg-white p-1">
              <div className={`h-full rounded-md ${stage.tone}`} style={{ width: `${Math.max((value / max) * 100, value ? 10 : 0)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecruitmentAnalytics({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const analytics = data?.analytics;
  if (loading) {
    return (
      <SectionCard title="ATS Analytics" icon={BarChart3}>
        <LoadingRows rows={6} />
      </SectionCard>
    );
  }
  if (!analytics) {
    return (
      <SectionCard title="ATS Analytics" icon={BarChart3}>
        <EmptyState label="Analytics will appear once recruitment activity is available" />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric
          label="Time to Hire"
          value={analytics.time_to_hire_days != null ? `${analytics.time_to_hire_days} days` : '-'}
          sub="Average application to employee conversion"
          icon={Target}
        />
        <AnalyticsMetric
          label="Offer Acceptance"
          value={formatPercent(analytics.offer_acceptance.acceptance_rate)}
          sub={`${analytics.offer_acceptance.accepted_offers || 0}/${analytics.offer_acceptance.responded_offers || 0} responded offers accepted`}
          icon={TrendingUp}
        />
        <AnalyticsMetric
          label="Joining Ratio"
          value={formatPercent(analytics.joining_ratio.ratio)}
          sub={`${analytics.joining_ratio.joined || 0}/${analytics.joining_ratio.accepted_offers || 0} accepted offers joined`}
          icon={UserCheck}
        />
        <AnalyticsMetric
          label="Candidate Conversion"
          value={formatPercent(analytics.candidate_conversion?.candidate_to_hire_rate)}
          sub="Applications converted into hires"
          icon={GitBranch}
        />
      </div>

      <SectionCard title="Hiring Funnel" icon={GitBranch}>
        <AnalyticsFunnel analytics={analytics} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Time per Stage" icon={Calendar}>
          <BarList
            rows={analytics.time_per_stage}
            labelKey="stage"
            valueKey="avg_days"
            emptyLabel="No stage movement has been recorded yet"
            detail={(row) => `${toNumber(row.transitions)} transition${toNumber(row.transitions) === 1 ? '' : 's'} recorded`}
          />
        </SectionCard>

        <SectionCard title="Recruiter Performance" icon={Users}>
          <BarList
            rows={analytics.recruiter_performance}
            labelKey="recruiter_name"
            valueKey="hires"
            emptyLabel="No recruiter performance data yet"
            detail={(row) => `${toNumber(row.candidates)} candidates - ${formatPercent(row.hire_rate)} hire rate`}
          />
        </SectionCard>

        <SectionCard title="Source Effectiveness" icon={Megaphone}>
          <BarList
            rows={analytics.source_effectiveness}
            labelKey="source"
            valueKey="applications"
            emptyLabel="No source data available yet"
            detail={(row) => `${toNumber(row.hires)} hires - ${formatPercent(row.conversion_rate)} conversion`}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Vacancy Analytics" icon={Briefcase}>
          {!analytics.vacancy_analytics.length ? (
            <EmptyState label="No vacancy analytics available yet" />
          ) : (
            <div className="space-y-3">
              {analytics.vacancy_analytics.slice(0, 6).map((vacancy) => (
                <Link key={vacancy.id} href={`/dashboard/hr/recruitment/vacancies/${vacancy.id}`} className="block rounded-lg bg-muted/30 p-3 hover:bg-muted">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{vacancy.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{vacancy.department} - {vacancy.status.replace(/_/g, ' ')}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {toNumber(vacancy.applications)} candidates
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <span className="rounded-lg bg-white px-2 py-1 text-muted-foreground">{toNumber(vacancy.shortlisted)} shortlisted</span>
                    <span className="rounded-lg bg-white px-2 py-1 text-muted-foreground">{toNumber(vacancy.accepted_offers)} accepted</span>
                    <span className="rounded-lg bg-white px-2 py-1 text-muted-foreground">{toNumber(vacancy.hires)} hired</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Candidate Conversion" icon={TrendingUp}>
          <BarList
            rows={analytics.monthly_trend}
            labelKey="month"
            valueKey="applications"
            emptyLabel="No monthly conversion trend yet"
            detail={(row) => `${toNumber(row.hires)} hires - ${toNumber(row.joined)} joined`}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function RecruitmentCalendar({
  interviews,
  joiners,
  loading,
}: {
  interviews: DashboardOverview['upcoming_interviews'];
  joiners: DashboardOverview['joining_schedule'];
  loading: boolean;
}) {
  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: 7 }, (_, index) => addDays(today, index));
  }, []);

  if (loading) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const interviewCount = interviews.filter((item) => {
          const date = safeDate(item.scheduled_at);
          return date ? isSameDay(date, day) : false;
        }).length;
        const joiningCount = joiners.filter((item) => {
          const date = safeDate(item.joining_date);
          return date ? isSameDay(date, day) : false;
        }).length;
        const total = interviewCount + joiningCount;

        return (
          <div key={day.toISOString()} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">{format(day, 'EEE, MMM d')}</p>
              <p className="text-xs text-muted-foreground">
                {total ? `${interviewCount} interviews, ${joiningCount} joining` : 'No scheduled hiring events'}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${total ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RoleWorkQueues({ data, loading }: { data: DashboardOverview | null; loading: boolean }) {
  const awaitingApprovalTotal = getTotal(data?.awaiting_approval);
  const feedbackDue = data?.upcoming_interviews.filter((interview) => {
    const date = safeDate(interview.scheduled_at);
    return date ? date.getTime() < Date.now() : false;
  }).length ?? 0;
  const joiningReady = data?.joining_schedule.length ?? 0;

  const queues = [
    {
      role: 'Recruiter',
      href: '/dashboard/hr/recruitment/pipeline',
      metric: data?.pipeline_counts?.applied ?? 0,
      label: 'new applications to screen',
      next: 'Screen candidates and move qualified profiles forward.',
      icon: Users,
    },
    {
      role: 'HR Coordinator',
      href: '/dashboard/hr/recruitment/interviews',
      metric: feedbackDue,
      label: 'interviews needing follow-up',
      next: 'Collect feedback, reschedule, or mark rounds complete.',
      icon: Calendar,
    },
    {
      role: 'Approver',
      href: '/dashboard/approvals',
      metric: awaitingApprovalTotal,
      label: 'recruitment approvals pending',
      next: 'Review vacancy, JD, offer, and workforce approvals.',
      icon: ClipboardCheck,
    },
    {
      role: 'HR Operations',
      href: '/dashboard/hr/recruitment/onboarding',
      metric: joiningReady,
      label: 'accepted candidates in joining flow',
      next: 'Complete preboarding and convert ready hires to employees.',
      icon: UserCheck,
    },
  ];

  return (
    <SectionCard title="Role-Based Work Queues" icon={ListChecks}>
      {loading ? <LoadingRows rows={4} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {queues.map(({ role, href, metric, label, next, icon: Icon }) => (
            <Link key={role} href={href} className="rounded-lg border border-border p-4 hover:bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{role}</p>
                  <p className="mt-2 text-2xl font-bold text-primary">{metric}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{next}</p>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function RecruitmentDashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api.get('/recruitment/dashboard')
      .then((response) => {
        if (mounted) setData(response.data.data);
      })
      .catch(() => {
        if (mounted) setData(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    notificationsApi.list({ source_module: 'recruitment', status: 'active', limit: 5 })
      .then((response) => {
        if (mounted) setNotifications(response.data);
      })
      .catch(() => {
        if (mounted) setNotifications([]);
      })
      .finally(() => {
        if (mounted) setNotificationsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const awaitingApprovalTotal = getTotal(data?.awaiting_approval);
  const activeCandidates = data
    ? Object.values(data.pipeline_counts || {}).reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;
  const joiningThisWeek = data?.joining_schedule.filter((item) => {
    const date = safeDate(item.joining_date);
    if (!date) return false;
    const today = startOfToday();
    return date >= today && date <= addDays(today, 6);
  }) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recruitment Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A single control center for vacancies, candidates, interviews, approvals, offers, and joining readiness.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-[34rem]">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Active Vacancies"
          value={formatNumber(data?.open_vacancies, loading)}
          sub="Open roles needing movement"
          icon={Briefcase}
          href="/dashboard/hr/recruitment/vacancies"
          tone="bg-blue-50 text-blue-700"
        />
        <KpiCard
          label="Candidates in Pipeline"
          value={formatNumber(activeCandidates, loading)}
          sub="Across active pipeline stages"
          icon={GitBranch}
          href="/dashboard/hr/recruitment/pipeline"
          tone="bg-teal-50 text-teal-700"
        />
        <KpiCard
          label="Offers Pending"
          value={formatNumber((data?.offers_pending?.sent ?? 0) + (data?.offers_pending?.pending_approval ?? 0), loading)}
          sub="Approval or candidate response"
          icon={FileSignature}
          href="/dashboard/hr/recruitment/offers"
          tone="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          label="Joining This Week"
          value={formatNumber(joiningThisWeek.length, loading)}
          sub="Preboarding needs attention"
          icon={UserCheck}
          href="/dashboard/hr/recruitment/onboarding"
          tone="bg-violet-50 text-violet-700"
        />
        <KpiCard
          label="Pending Approvals"
          value={formatNumber(awaitingApprovalTotal, loading)}
          sub="Recruitment approvals waiting"
          icon={ClipboardCheck}
          href="/dashboard/approvals"
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      <RecruitmentWorkflowGuide />

      <ActionCards data={data} loading={loading} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <QuickStartPanel data={data} loading={loading} />
        <div className="space-y-4">
          <GuidedWorkflowPanel data={data} loading={loading} />
          <SectionCard title="Smart Warnings" icon={ShieldAlert}>
            <SmartWarnings data={data} loading={loading} />
          </SectionCard>
        </div>
      </div>

      <NextActions data={data} loading={loading} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricTile
          label="Average time to hire"
          value={loading ? '...' : data?.kpis?.avg_time_to_hire_days != null ? `${data.kpis.avg_time_to_hire_days} days` : '-'}
          sub="Accepted candidates from application to hire"
        />
        <MetricTile
          label="Average decision time"
          value={loading ? '...' : data?.kpis?.avg_decision_days != null ? `${data.kpis.avg_decision_days} days` : '-'}
          sub="Recruiter review and selection speed"
        />
        <MetricTile
          label="Offer acceptance rate"
          value={loading ? '...' : data?.kpis?.offer_acceptance_rate != null ? `${data.kpis.offer_acceptance_rate}%` : '-'}
          sub="Accepted offers versus final responses"
        />
      </div>

      <RecruitmentAnalytics data={data} loading={loading} />

      <RoleWorkQueues data={data} loading={loading} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Today's Interviews" icon={Calendar} action={{ label: 'Open queue', href: '/dashboard/hr/recruitment/interviews' }}>
          <TodayInterviews items={data?.upcoming_interviews ?? []} loading={loading} />
        </SectionCard>

        <SectionCard title="Candidates in Pipeline" icon={GitBranch} action={{ label: 'Open pipeline', href: '/dashboard/hr/recruitment/pipeline' }}>
          <PipelineSummary data={data} loading={loading} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Active Vacancies" icon={Briefcase} action={{ label: 'View vacancies', href: '/dashboard/hr/recruitment/vacancies' }}>
          {loading ? <LoadingRows rows={4} /> : !data?.dept_hiring_status?.length ? (
            <EmptyState label="No active vacancy data available" />
          ) : (
            <div className="space-y-2">
              {data.dept_hiring_status.slice(0, 6).map((department) => (
                <div key={department.department} className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">{department.department || 'Unassigned'}</p>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {department.open} open
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {department.on_hold} on hold - {department.closed} closed
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Joining This Week" icon={UserCheck} action={{ label: 'Preboarding', href: '/dashboard/hr/recruitment/onboarding' }}>
          {loading ? <LoadingRows rows={4} /> : !joiningThisWeek.length ? (
            <EmptyState label="No joiners scheduled this week" />
          ) : (
            <div className="space-y-3">
              {joiningThisWeek.slice(0, 5).map((joiner) => {
                const date = safeDate(joiner.joining_date);
                return (
                  <div key={joiner.application_id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {joiner.first_name} {joiner.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{joiner.job_title}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {date ? format(date, 'MMM d') : 'TBD'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Offers Pending" icon={FileSignature} action={{ label: 'Review offers', href: '/dashboard/hr/recruitment/offers' }}>
          {loading ? <LoadingRows rows={3} /> : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-amber-50 p-4">
                <Send className="mb-3 h-4 w-4 text-amber-700" />
                <p className="text-2xl font-bold text-amber-800">{data?.offers_pending?.sent ?? 0}</p>
                <p className="text-xs text-amber-700">Awaiting candidate response</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <ClipboardCheck className="mb-3 h-4 w-4 text-blue-700" />
                <p className="text-2xl font-bold text-blue-800">{data?.offers_pending?.pending_approval ?? 0}</p>
                <p className="text-xs text-blue-700">Waiting for approval</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <CheckCircle2 className="mb-3 h-4 w-4 text-emerald-700" />
                <p className="text-2xl font-bold text-emerald-800">{data?.offers_pending?.accepted ?? 0}</p>
                <p className="text-xs text-emerald-700">Accepted</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <ListChecks className="mb-3 h-4 w-4 text-red-700" />
                <p className="text-2xl font-bold text-red-800">{data?.offers_pending?.declined ?? 0}</p>
                <p className="text-xs text-red-700">Declined</p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Recruitment Calendar" icon={Calendar}>
          <RecruitmentCalendar
            interviews={data?.upcoming_interviews ?? []}
            joiners={data?.joining_schedule ?? []}
            loading={loading}
          />
        </SectionCard>

        <SectionCard title="Pending Approvals" icon={ClipboardCheck} action={{ label: 'Open inbox', href: '/dashboard/approvals' }}>
          {loading ? <LoadingRows rows={4} /> : !awaitingApprovalTotal ? (
            <EmptyState label="No recruitment approvals are pending" />
          ) : (
            <div className="space-y-2">
              {Object.entries(data?.awaiting_approval ?? {})
                .filter(([, count]) => Number(count) > 0)
                .map(([key, count]) => (
                  <Link
                    key={key}
                    href="/dashboard/approvals"
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 hover:bg-muted"
                  >
                    <span className="text-sm font-medium text-foreground">{approvalLabels[key] ?? key.replace(/_/g, ' ')}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{count}</span>
                  </Link>
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recruitment Notifications" icon={Bell} action={{ label: 'All notifications', href: '/dashboard/notifications' }}>
          {notificationsLoading ? <LoadingRows rows={4} /> : !notifications.length ? (
            <EmptyState label="No active recruitment notifications" />
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.action_url || '/dashboard/notifications'}
                  className="block rounded-lg bg-muted/30 p-3 hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{notification.title}</p>
                    {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Recruiter Workload" icon={Users}>
          {loading ? <LoadingRows rows={4} /> : !data?.recruiter_workload?.length ? (
            <EmptyState label="No recruiters assigned to active vacancies" />
          ) : (
            <div className="space-y-3">
              {data.recruiter_workload.slice(0, 6).map((recruiter) => (
                <div key={recruiter.recruiter_id} className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {recruiter.first_name} {recruiter.last_name}
                    </p>
                    <span className="text-xs font-medium text-primary">{recruiter.active_applications} candidates</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{recruiter.open_vacancies} open vacancies assigned</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent Activities" icon={Megaphone}>
          {loading ? <LoadingRows rows={5} /> : !data?.recent_activity?.length ? (
            <EmptyState label="No recent recruitment activity" />
          ) : (
            <div className="space-y-3">
              {data.recent_activity.slice(0, 8).map((activity, index) => (
                <div key={`${activity.entity_id}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize text-foreground">
                      {activity.entity_type.replace(/_/g, ' ')} - {activity.action.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{activity.actor_email || 'System'}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(parseISO(activity.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="rounded-lg border border-border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex min-h-20 flex-col items-start justify-between rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
