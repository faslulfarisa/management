'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import api from '@/lib/api';
import { Briefcase, Users, Calendar, FileSignature, ClipboardCheck, ArrowRight, TrendingUp } from 'lucide-react';

interface DashboardOverview {
  open_vacancies: number;
  awaiting_approval: Record<string, number>;
  pipeline_counts: Record<string, number>;
  upcoming_interviews: Array<{ id: string; scheduled_at: string; round_type: string; round_number: number; first_name: string; last_name: string; job_title: string }>;
  offers_pending: { sent: number; pending_approval: number; accepted: number; declined: number };
  joining_schedule: Array<{ application_id: string; joining_date: string; first_name: string; last_name: string; job_title: string }>;
  recruiter_workload: Array<{ recruiter_id: string; first_name: string; last_name: string; open_vacancies: number; active_applications: number }>;
  dept_hiring_status: Array<{ department: string; open: number; on_hold: number; closed: number }>;
  hiring_funnel: { applied: number; under_review_plus: number; shortlisted: number; hired: number; rejected: number; withdrawn: number };
  recent_activity: Array<{ entity_type: string; action: string; entity_id: string; created_at: string; actor_email: string | null }>;
  kpis: { avg_time_to_hire_days: number | null; avg_decision_days: number | null; offer_acceptance_rate: number | null };
}

function StatCard({ label, value, sub, gradient, icon: Icon, href }: { label: string; value: number | string; sub?: string; gradient: string; icon: any; href: string }) {
  return (
    <Link href={href} className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg block ${gradient} hover:brightness-110 transition-all`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
      <div className="relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-bold tracking-tight mb-0.5">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </Link>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action && (
          <Link href={action.href} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
            {action.label} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground text-center py-4">{label}</p>;
}

const FUNNEL_STAGES: Array<{ key: keyof DashboardOverview['hiring_funnel']; label: string }> = [
  { key: 'applied', label: 'Applied' },
  { key: 'under_review_plus', label: 'In Review' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'hired', label: 'Hired' },
];

export default function RecruitmentOverviewPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/recruitment/dashboard').then((r) => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const awaitingApprovalTotal = data
    ? Object.values(data.awaiting_approval || {}).reduce((sum, n) => sum + Number(n), 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recruitment</h1>
        <p className="text-muted-foreground">Hiring funnel, pipeline, interviews, offers, and workforce KPIs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Open Vacancies" value={loading ? '—' : data?.open_vacancies ?? 0} gradient="card-gradient-blue" icon={Briefcase} href="/dashboard/hr/recruitment/vacancies" />
        <StatCard label="Awaiting Approval" value={loading ? '—' : awaitingApprovalTotal} gradient="card-gradient-amber" icon={ClipboardCheck} href="/dashboard/approvals" />
        <StatCard label="Upcoming Interviews (7d)" value={loading ? '—' : data?.upcoming_interviews.length ?? 0} gradient="card-gradient-teal" icon={Calendar} href="/dashboard/hr/recruitment/interviews" />
        <StatCard label="Offers Pending Response" value={loading ? '—' : data?.offers_pending?.sent ?? 0} gradient="card-gradient-emerald" icon={FileSignature} href="/dashboard/hr/recruitment/offers" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Avg. Time to Hire</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{data?.kpis?.avg_time_to_hire_days ?? '—'} <span className="text-sm font-medium text-muted-foreground">days</span></p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Avg. Decision Time</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{data?.kpis?.avg_decision_days ?? '—'} <span className="text-sm font-medium text-muted-foreground">days</span></p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Offer Acceptance Rate</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{data?.kpis?.offer_acceptance_rate != null ? `${data.kpis.offer_acceptance_rate}%` : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Hiring Funnel" action={{ label: 'View Pipeline', href: '/dashboard/hr/recruitment/pipeline' }}>
          {!data?.hiring_funnel ? <EmptyRow label="No applications yet" /> : (
            <div className="flex items-end gap-3">
              {FUNNEL_STAGES.map((s) => {
                const value = Number(data.hiring_funnel[s.key]) || 0;
                const max = Math.max(...FUNNEL_STAGES.map((f) => Number(data.hiring_funnel[f.key]) || 0), 1);
                return (
                  <div key={s.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <p className="text-sm font-bold text-foreground">{value}</p>
                    <div className="w-full bg-muted/40 rounded-lg overflow-hidden h-24 flex items-end">
                      <div className="w-full bg-primary/70 rounded-t-lg" style={{ height: `${(value / max) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Department Hiring Status" action={{ label: 'View Vacancies', href: '/dashboard/hr/recruitment/vacancies' }}>
          {!data?.dept_hiring_status?.length ? <EmptyRow label="No vacancies yet" /> : (
            <div className="space-y-2.5">
              {data.dept_hiring_status.map((d) => (
                <div key={d.department} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate">{d.department}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-semibold">{d.open} open</span>
                    <span className="text-amber-600 font-semibold">{d.on_hold} hold</span>
                    <span className="text-muted-foreground">{d.closed} closed</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Upcoming Interviews" action={{ label: 'View All', href: '/dashboard/hr/recruitment/interviews' }}>
          {!data?.upcoming_interviews?.length ? <EmptyRow label="No interviews scheduled in the next 7 days" /> : (
            <div className="space-y-2.5">
              {data.upcoming_interviews.map((i) => (
                <div key={i.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{i.first_name} {i.last_name}</p>
                    <p className="text-xs text-muted-foreground">{i.job_title} • Round {i.round_number} ({i.round_type})</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(i.scheduled_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Joining Schedule (14 days)" action={{ label: 'View Onboarding', href: '/dashboard/hr/recruitment/onboarding' }}>
          {!data?.joining_schedule?.length ? <EmptyRow label="No upcoming joiners" /> : (
            <div className="space-y-2.5">
              {data.joining_schedule.map((j) => (
                <div key={j.application_id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{j.first_name} {j.last_name}</p>
                    <p className="text-xs text-muted-foreground">{j.job_title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(j.joining_date).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Recruiter Workload">
          {!data?.recruiter_workload?.length ? <EmptyRow label="No recruiters assigned to open vacancies" /> : (
            <div className="space-y-2.5">
              {data.recruiter_workload.map((r) => (
                <div key={r.recruiter_id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground">{r.first_name} {r.last_name}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{r.open_vacancies} open</span>
                    <span>{r.active_applications} active candidates</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent Activity">
          {!data?.recent_activity?.length ? <EmptyRow label="No recent activity" /> : (
            <div className="space-y-2.5">
              {data.recent_activity.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <p className="text-sm text-foreground capitalize">{a.entity_type.replace('_', ' ')} {a.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{a.actor_email || 'System'} • {formatDistanceToNow(parseISO(a.created_at), { addSuffix: true })}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/hr/recruitment/vacancies" className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
          <Briefcase className="w-3.5 h-3.5" /> New Vacancy
        </Link>
        <Link href="/dashboard/hr/recruitment/workforce-planning" className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
          <TrendingUp className="w-3.5 h-3.5" /> New Workforce Plan
        </Link>
        <Link href="/dashboard/hr/recruitment/campaigns" className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
          <Users className="w-3.5 h-3.5" /> New Campaign
        </Link>
      </div>
    </div>
  );
}
