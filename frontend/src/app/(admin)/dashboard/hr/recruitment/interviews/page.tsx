'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, RotateCcw, MessageSquare, CheckCircle2, XCircle, Search } from 'lucide-react';
import { interviewsApi, Interview } from '@/lib/interviews-api';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { InterviewDrawer } from '@/components/recruitment/interview-drawer';
import { InterviewFeedbackModal } from '@/components/recruitment/interview-feedback-modal';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const statusColors: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-gray-100 text-gray-800',
};

function ScheduleForApplicationPicker({ onClose, onPicked }: { onClose: () => void; onPicked: (applicationId: string) => void }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applicationsApi.list({ limit: 200 }).then((r) => { setApplications(r.data); setLoading(false); });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Select Application</h3>
        {loading ? (
          <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="">Select candidate & job…</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.job_title}</option>)}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={() => applicationId && onPicked(applicationId)} disabled={!applicationId} className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}

export default function InterviewsPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const [scheduleForApplication, setScheduleForApplication] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Interview | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await interviewsApi.list({ q: q || undefined, status: status || undefined, page, limit: PAGE_SIZE });
      setInterviews(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, [q, status, page]);

  useEffect(() => { setPage(1); }, [q, status]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      {showPicker && (
        <ScheduleForApplicationPicker onClose={() => setShowPicker(false)} onPicked={(appId) => { setShowPicker(false); setScheduleForApplication(appId); }} />
      )}
      {scheduleForApplication && (
        <InterviewDrawer applicationId={scheduleForApplication} onClose={() => setScheduleForApplication(null)} onSaved={fetchData} />
      )}
      {rescheduleTarget && (
        <InterviewDrawer rescheduling={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onSaved={fetchData} />
      )}
      {feedbackTarget && (
        <InterviewFeedbackModal interview={feedbackTarget} onClose={() => setFeedbackTarget(null)} onSaved={fetchData} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Interviews</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by candidate or vacancy…"
                  className="border border-border rounded-xl pl-8 pr-3 py-2 text-sm normal-case font-normal min-w-[200px]" />
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm normal-case font-normal capitalize">
                <option value="">All statuses</option>
                {['scheduled', 'rescheduled', 'completed', 'cancelled', 'no_show'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
                  <Plus className="w-3.5 h-3.5" /> Schedule Interview
                </button>
              </Can>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8">Loading...</p>
          ) : interviews.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No interviews scheduled</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left p-4 font-medium normal-case">Candidate</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Vacancy</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Round</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Scheduled</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Status</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Feedback</TableHead>
                  <TableHead className="text-left p-4 font-medium normal-case">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => i.application_id && router.push(`/dashboard/hr/recruitment/pipeline/${i.application_id}`)}>
                    <TableCell className="p-4">{i.first_name} {i.last_name}</TableCell>
                    <TableCell className="p-4 text-muted-foreground">{i.vacancy_title || '—'}</TableCell>
                    <TableCell className="p-4 capitalize">Round {i.round_number} • {i.round_type.replace('_', ' ')}</TableCell>
                    <TableCell className="p-4">{new Date(i.scheduled_at).toLocaleString()}</TableCell>
                    <TableCell className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs capitalize ${statusColors[i.status] || 'bg-gray-100'}`}>{i.status.replace('_', ' ')}</span>
                    </TableCell>
                    <TableCell className="p-4">{i.scorecard?.length ? `${i.scorecard.length} submitted` : '—'}</TableCell>
                    <TableCell className="p-4" onClick={(e) => e.stopPropagation()}>
                      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                        <div className="flex gap-1 flex-wrap">
                          {['scheduled', 'rescheduled'].includes(i.status) && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setRescheduleTarget(i)}><RotateCcw className="w-3 h-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => setFeedbackTarget(i)}><MessageSquare className="w-3 h-3" /></Button>
                              <Button size="sm" onClick={async () => { await interviewsApi.complete(i.id, {}); fetchData(); }}><CheckCircle2 className="w-3 h-3" /></Button>
                              <Button size="sm" variant="outline" className="text-red-600" onClick={async () => { await interviewsApi.cancel(i.id); fetchData(); }}><XCircle className="w-3 h-3" /></Button>
                            </>
                          )}
                        </div>
                      </Can>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ListPagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
    </>
  );
}
