'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  Archive,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileSignature,
  GitBranch,
  Loader2,
  Mail,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { pipelineStagesApi, PipelineStage, communicationTemplatesApi, CommunicationTemplate } from '@/lib/pipeline-api';
import { vacanciesApi, Vacancy } from '@/lib/vacancies-api';
import { Card } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { PipelineStageManager } from '@/components/recruitment/pipeline-stage-manager';
import { CommunicationTemplateManager } from '@/components/recruitment/communication-template-manager';
import { cn } from '@/lib/utils';
import {
  BulkActionBar,
  ContextualHelp,
  GuidedEmptyState,
  QuickFilterButton,
  RecruitmentStepIndicator,
} from '@/components/recruitment/recruitment-ux';

const PAGE_SIZE = 200;

type LaneKey =
  | 'applied'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'offered'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

interface LaneDefinition {
  key: LaneKey;
  label: string;
  description: string;
  icon: React.ElementType;
  match: (stage: PipelineStage) => boolean;
  status?: Application['status'];
  tone: string;
}

const LANE_DEFINITIONS: LaneDefinition[] = [
  {
    key: 'applied',
    label: 'Applied',
    description: 'New candidate applications',
    icon: Users,
    status: 'applied',
    tone: 'border-blue-200 bg-blue-50/60',
    match: (stage) => normalized(stage.name).includes('applied'),
  },
  {
    key: 'screening',
    label: 'Screening',
    description: 'Initial recruiter review',
    icon: ShieldCheck,
    status: 'under_review',
    tone: 'border-sky-200 bg-sky-50/60',
    match: (stage) => normalized(stage.name).includes('screen') || stage.stage_category === 'screening',
  },
  {
    key: 'shortlisted',
    label: 'Shortlisted',
    description: 'Candidates shortlisted for interview',
    icon: FileCheck2,
    status: 'shortlisted',
    tone: 'border-violet-200 bg-violet-50/60',
    match: (stage) => normalized(stage.name).includes('shortlist') || stage.stage_category === 'assessment',
  },
  {
    key: 'interview',
    label: 'Interview',
    description: 'Interview rounds',
    icon: Calendar,
    tone: 'border-orange-200 bg-orange-50/60',
    match: (stage) => normalized(stage.name).includes('interview') || stage.stage_category === 'interview',
  },
  {
    key: 'offered',
    label: 'Offered',
    description: 'Offer creation and approval',
    icon: FileSignature,
    tone: 'border-emerald-200 bg-emerald-50/60',
    match: (stage) => normalized(stage.name).includes('offer') || stage.stage_category === 'offer',
  },
  {
    key: 'hired',
    label: 'Hired',
    description: 'Converted to employee',
    icon: CheckCircle2,
    status: 'hired',
    tone: 'border-green-200 bg-green-50/60',
    match: (stage) => normalized(stage.name).includes('hired') || normalized(stage.name).includes('join'),
  },
  {
    key: 'rejected',
    label: 'Rejected',
    description: 'Not moving forward',
    icon: XCircle,
    status: 'rejected',
    tone: 'border-red-200 bg-red-50/60',
    match: (stage) => normalized(stage.name).includes('reject'),
  },
  {
    key: 'withdrawn',
    label: 'Withdrawn',
    description: 'Candidate withdrew application',
    icon: Archive,
    status: 'withdrawn',
    tone: 'border-slate-200 bg-slate-50/80',
    match: (stage) => normalized(stage.name).includes('withdraw') || normalized(stage.name).includes('archive'),
  },
];

const STATUS_STYLES: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  under_review: 'bg-amber-50 text-amber-700',
  shortlisted: 'bg-violet-50 text-violet-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  hired: 'bg-emerald-50 text-emerald-700',
};

function normalized(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stageForLane(lane: LaneDefinition, stages: PipelineStage[]) {
  return stages
    .filter((stage) => stage.is_active)
    .sort((a, b) => a.stage_order - b.stage_order)
    .find((stage) => lane.match(stage));
}

function laneForApplication(application: Application, laneStages: Map<LaneKey, PipelineStage | undefined>) {
  if (application.status === 'hired') return 'hired';
  if (application.status === 'rejected') return 'rejected';
  if (application.status === 'withdrawn') return 'withdrawn';

  const currentStageId = application.current_stage_id;
  if (currentStageId) {
    for (const [laneKey, stage] of laneStages.entries()) {
      if (stage?.id === currentStageId) return laneKey;
    }
  }

  if (application.status === 'applied') return 'applied';
  if (application.status === 'under_review') return 'screening';
  if (application.status === 'shortlisted') return 'shortlisted';
  return 'applied'; // Default fallback
}

function canMoveToLane(lane: LaneDefinition, laneStage?: PipelineStage) {
  return Boolean(lane.status || laneStage);
}

function CandidateCard({
  application,
  lanes,
  onOpen,
  onMove,
  selected,
  onToggleSelected,
  draggable,
  moving,
}: {
  application: Application;
  lanes: Array<LaneDefinition & { stage?: PipelineStage }>;
  onOpen: () => void;
  onMove: (lane: LaneDefinition & { stage?: PipelineStage }) => void;
  selected: boolean;
  onToggleSelected: () => void;
  draggable: boolean;
  moving: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/id', application.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'rounded-lg border border-border bg-white p-3 shadow-sm transition-all hover:shadow-md',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        moving && 'opacity-60',
      )}
    >
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span onClick={(event) => event.stopPropagation()} className="pt-0.5">
              <input type="checkbox" checked={selected} onChange={onToggleSelected} title="Select for bulk action" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{application.first_name} {application.last_name}</p>
              <p className="truncate text-xs text-muted-foreground">{application.candidate_email}</p>
            </div>
          </div>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_STYLES[application.status] || 'bg-muted text-muted-foreground')}>
            {application.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{application.job_title || 'No vacancy linked'}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Applied {formatDistanceToNow(parseISO(application.applied_at), { addSuffix: true })}
        </p>
      </button>

      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
        <div className="mt-3 border-t border-border pt-3 md:hidden">
          <label className="text-[11px] font-medium text-muted-foreground">Move candidate</label>
          <select
            defaultValue=""
            disabled={moving}
            onChange={(event) => {
              const lane = lanes.find((item) => item.key === event.target.value);
              if (lane) onMove(lane);
              event.currentTarget.value = '';
            }}
            className="mt-1 w-full rounded-lg border border-border px-2.5 py-2 text-xs"
          >
            <option value="" disabled>Select stage...</option>
            {lanes.filter((lane) => canMoveToLane(lane, lane.stage)).map((lane) => (
              <option key={lane.key} value={lane.key}>{lane.label}</option>
            ))}
          </select>
        </div>
      </Can>
    </div>
  );
}

export default function PipelinePage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [vacancyId, setVacancyId] = useState('');
  const [stageId, setStageId] = useState('');
  const [status, setStatus] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'screening' | 'interviews' | 'offers' | 'stalled'>('all');
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [dragOverLane, setDragOverLane] = useState<LaneKey | null>(null);
  const [movingApplicationId, setMovingApplicationId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLaneKey, setBulkLaneKey] = useState('');

  const loadConfig = useCallback(() => {
    Promise.all([pipelineStagesApi.list(true), vacanciesApi.list({ limit: 100, includeArchived: true }), communicationTemplatesApi.list(true)])
      .then(([stageList, vacancyList, templateList]) => {
        setStages(stageList);
        setVacancies(vacancyList.data);
        setTemplates(templateList);
      });
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicationsApi.list({
        q: q || undefined,
        vacancy_id: vacancyId || undefined,
        stage_id: stageId || undefined,
        status: status || undefined,
        page: 1,
        limit: PAGE_SIZE,
      });
      setApplications(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [q, vacancyId, stageId, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const lanes = useMemo(() => {
    return LANE_DEFINITIONS.map((lane) => ({
      ...lane,
      stage: stageForLane(lane, stages),
    }));
  }, [stages]);

  const laneStageMap = useMemo(() => {
    const map = new Map<LaneKey, PipelineStage | undefined>();
    lanes.forEach((lane) => map.set(lane.key, lane.stage));
    return map;
  }, [lanes]);

  const visibleApplications = useMemo(() => {
    return applications.filter((application) => {
      const lane = laneForApplication(application, laneStageMap);
      if (quickFilter === 'screening') return lane === 'applied' || lane === 'screening';
      if (quickFilter === 'interviews') return lane === 'shortlisted' || lane === 'interview';
      if (quickFilter === 'offers') return lane === 'offered';
      if (quickFilter === 'stalled') return new Date(application.applied_at).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000 && !['hired', 'rejected', 'withdrawn'].includes(application.status);
      return true;
    });
  }, [applications, laneStageMap, quickFilter]);

  const groupedApplications = useMemo(() => {
    const grouped = new Map<LaneKey, Application[]>();
    LANE_DEFINITIONS.forEach((lane) => grouped.set(lane.key, []));
    visibleApplications.forEach((application) => {
      const laneKey = laneForApplication(application, laneStageMap);
      grouped.set(laneKey, [...(grouped.get(laneKey) || []), application]);
    });
    return grouped;
  }, [visibleApplications, laneStageMap]);

  const moveApplication = async (applicationId: string, lane: LaneDefinition & { stage?: PipelineStage }) => {
    if (!canMoveToLane(lane, lane.stage)) return;
    const application = applications.find((item) => item.id === applicationId);
    if (!application) return;

    if (lane.stage?.id === application.current_stage_id && (!lane.status || lane.status === application.status)) return;

    setMovingApplicationId(applicationId);
    try {
      if (lane.stage) {
        await applicationsApi.moveStage(applicationId, lane.stage.id, `Moved to ${lane.label} from Kanban board`);
      } else if (lane.status) {
        const reason = lane.status === 'rejected'
          ? window.prompt('Rejection reason (optional):') || undefined
          : undefined;
        await applicationsApi.updateStatus(applicationId, lane.status, reason);
      }
      await fetchData();
    } finally {
      setMovingApplicationId(null);
      setDragOverLane(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkMove = async () => {
    const lane = lanes.find((item) => item.key === bulkLaneKey);
    if (!lane || !selected.size) return;
    if (!window.confirm(`Move ${selected.size} selected application(s) to ${lane.label}?`)) return;
    for (const applicationId of Array.from(selected)) {
      await moveApplication(applicationId, lane);
    }
    setSelected(new Set());
    setBulkLaneKey('');
    await fetchData();
  };

  const quickCounts = {
    screening: applications.filter((application) => {
      const lane = laneForApplication(application, laneStageMap);
      return lane === 'applied' || lane === 'screening';
    }).length,
    interviews: applications.filter((application) => ['shortlisted', 'interview'].includes(laneForApplication(application, laneStageMap))).length,
    offers: applications.filter((application) => laneForApplication(application, laneStageMap) === 'offered').length,
    stalled: applications.filter((application) => new Date(application.applied_at).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000 && !['hired', 'rejected', 'withdrawn'].includes(application.status)).length,
  };

  const steps = [
    { label: 'Screen', description: 'Review applied candidates and decide who moves forward.', status: quickCounts.screening ? 'current' as const : 'complete' as const },
    { label: 'Assess', description: 'Assign tests or structured evaluations when needed.', status: groupedApplications.get('shortlisted')?.length ? 'current' as const : 'pending' as const },
    { label: 'Interview', description: 'Move candidates through technical, manager, and HR rounds.', status: quickCounts.interviews ? 'current' as const : 'pending' as const },
    { label: 'Offer', description: 'Create offers only after interview decision is ready.', status: quickCounts.offers ? 'current' as const : 'pending' as const },
  ];

  return (
    <div className="space-y-4">
      {showStageManager && <PipelineStageManager stages={stages} onClose={() => setShowStageManager(false)} onChanged={loadConfig} />}
      {showTemplateManager && <CommunicationTemplateManager templates={templates} onClose={() => setShowTemplateManager(false)} onChanged={loadConfig} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recruitment Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Drag candidates between stages on desktop. On mobile, use the move control on each candidate card.
          </p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowStageManager(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Settings className="h-3.5 w-3.5" /> Manage Stages
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Mail className="h-3.5 w-3.5" /> Manage Templates
            </button>
          </div>
        </Can>
      </div>

      <RecruitmentStepIndicator steps={steps} />
      <ContextualHelp title="Pipeline shortcuts">
        Drag cards on desktop, use the move selector on mobile, or select multiple cards and bulk move them after a confirmation.
      </ContextualHelp>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search by candidate name or email..."
              className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select value={vacancyId} onChange={(event) => setVacancyId(event.target.value)} className="max-w-[220px] rounded-lg border border-border px-3 py-2 text-sm">
            <option value="">All vacancies</option>
            {vacancies.map((vacancy) => <option key={vacancy.id} value={vacancy.id}>{vacancy.title}</option>)}
          </select>
          <select value={stageId} onChange={(event) => setStageId(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm">
            <option value="">All stages</option>
            {stages.filter((stage) => stage.is_active).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm capitalize">
            <option value="">All statuses</option>
            {['applied', 'under_review', 'shortlisted', 'rejected', 'withdrawn', 'hired'].map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{total} applications</span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <QuickFilterButton active={quickFilter === 'all'} label="All" count={applications.length} onClick={() => setQuickFilter('all')} />
        <QuickFilterButton active={quickFilter === 'screening'} label="Needs screening" count={quickCounts.screening} onClick={() => setQuickFilter('screening')} />
        <QuickFilterButton active={quickFilter === 'interviews'} label="Interview queue" count={quickCounts.interviews} onClick={() => setQuickFilter('interviews')} />
        <QuickFilterButton active={quickFilter === 'offers'} label="Offer-ready" count={quickCounts.offers} onClick={() => setQuickFilter('offers')} />
        <QuickFilterButton active={quickFilter === 'stalled'} label="Stalled 14+ days" count={quickCounts.stalled} onClick={() => setQuickFilter('stalled')} />
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <select value={bulkLaneKey} onChange={(event) => setBulkLaneKey(event.target.value)} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs">
            <option value="">Move to...</option>
            {lanes.filter((lane) => canMoveToLane(lane, lane.stage)).map((lane) => <option key={lane.key} value={lane.key}>{lane.label}</option>)}
          </select>
          <button onClick={bulkMove} disabled={!bulkLaneKey} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">Apply Move</button>
        </Can>
      </BulkActionBar>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visibleApplications.length === 0 ? (
        <GuidedEmptyState
          title="No applications match this pipeline view"
          description="Clear filters or open Candidates to source and attach people to active vacancies. Once attached, they appear here for stage movement."
          action={<button onClick={() => setQuickFilter('all')} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">Clear quick filter</button>}
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex w-max gap-3">
            {lanes.map((lane) => {
              const LaneIcon = lane.icon;
              const items = groupedApplications.get(lane.key) || [];
              const movable = canMoveToLane(lane, lane.stage);
              return (
                <section
                  key={lane.key}
                  onDragOver={(event) => {
                    if (!movable) return;
                    event.preventDefault();
                    setDragOverLane(lane.key);
                  }}
                  onDragLeave={() => setDragOverLane((current) => current === lane.key ? null : current)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const applicationId = event.dataTransfer.getData('application/id');
                    if (applicationId) void moveApplication(applicationId, lane);
                  }}
                  className={cn(
                    'flex max-h-[calc(100vh-19rem)] min-h-[34rem] w-72 shrink-0 flex-col rounded-lg border p-2 transition-colors',
                    lane.tone,
                    dragOverLane === lane.key && movable && 'ring-2 ring-primary/40',
                    !movable && 'opacity-70',
                  )}
                >
                  <div className="mb-2 rounded-md bg-white/80 p-2 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <LaneIcon className="h-4 w-4 shrink-0 text-primary" />
                        <p className="text-sm font-semibold leading-snug text-foreground">{lane.label}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground">{items.length}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">{lane.description}</p>
                    {!movable && (
                      <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs leading-snug text-amber-700">
                        Configure this stage to allow drops.
                      </p>
                    )}
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                    {items.length === 0 ? (
                      <div className="py-8 px-4 text-center">
                        <p className="text-sm font-medium text-muted-foreground">No candidates in this stage.</p>
                      </div>
                    ) : (
                      items.map((app) => (
                        <CandidateCard
                          key={app.id}
                          application={app}
                          lanes={lanes}
                          onOpen={() => router.push(`/dashboard/hr/recruitment/pipeline/${app.id}`)}
                          onMove={(targetLane) => moveApplication(app.id, targetLane)}
                          selected={selected.has(app.id)}
                          onToggleSelected={() => toggleSelected(app.id)}
                          draggable={!movingApplicationId}
                          moving={movingApplicationId === app.id}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
