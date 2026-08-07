'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Loader2, Search, Settings, Mail } from 'lucide-react';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { pipelineStagesApi, PipelineStage, communicationTemplatesApi, CommunicationTemplate } from '@/lib/pipeline-api';
import { vacanciesApi, Vacancy } from '@/lib/vacancies-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { PipelineStageManager } from '@/components/recruitment/pipeline-stage-manager';
import { CommunicationTemplateManager } from '@/components/recruitment/communication-template-manager';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  under_review: 'bg-amber-50 text-amber-700',
  shortlisted: 'bg-violet-50 text-violet-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  hired: 'bg-emerald-50 text-emerald-700',
};

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
  const [page, setPage] = useState(1);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [showStageManager, setShowStageManager] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const loadConfig = useCallback(() => {
    Promise.all([pipelineStagesApi.list(true), vacanciesApi.list({ limit: 100, includeArchived: true }), communicationTemplatesApi.list(true)])
      .then(([s, v, t]) => { setStages(s); setVacancies(v.data); setTemplates(t); });
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicationsApi.list({
        q: q || undefined, vacancy_id: vacancyId || undefined, stage_id: stageId || undefined, status: status || undefined, page, limit: PAGE_SIZE,
      });
      setApplications(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [q, vacancyId, stageId, status, page]);

  useEffect(() => { setPage(1); }, [q, vacancyId, stageId, status]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showStageManager && <PipelineStageManager stages={stages} onClose={() => setShowStageManager(false)} onChanged={loadConfig} />}
      {showTemplateManager && <CommunicationTemplateManager templates={templates} onClose={() => setShowTemplateManager(false)} onChanged={loadConfig} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recruitment Pipeline</h2>
          <p className="text-sm text-muted-foreground">Screening, assessments, interviews, and evaluations for every active application</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowStageManager(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
              <Settings className="w-3.5 h-3.5" /> Manage Stages
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
              <Mail className="w-3.5 h-3.5" /> Manage Templates
            </button>
          </div>
        </Can>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by candidate name or email…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={vacancyId} onChange={(e) => setVacancyId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm max-w-[220px]">
          <option value="">All vacancies</option>
          {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
        </select>
        <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm">
          <option value="">All stages</option>
          {stages.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {['applied', 'under_review', 'shortlisted', 'rejected', 'withdrawn', 'hired'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : applications.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No applications in the pipeline yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Vacancy</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/pipeline/${a.id}`)}>
                  <TableCell className="font-medium">{a.first_name} {a.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.job_title || '—'}</TableCell>
                  <TableCell>
                    {a.stage_name ? <span className="px-2 py-1 rounded-full text-xs bg-muted/60">{a.stage_name}</span> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[a.status] || 'bg-gray-100'}`}>{a.status.replace('_', ' ')}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDistanceToNow(parseISO(a.applied_at), { addSuffix: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ListPagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
