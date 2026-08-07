'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  ArrowLeft, Loader2, Save, Plus, Calendar, Send, XCircle, CheckCircle2, RotateCcw, MessageSquare, ClipboardList,
} from 'lucide-react';
import {
  applicationsApi, Application, CandidateScreening, CandidateAssessment, CandidateEvaluation,
  CandidateCommunication, PipelineStageHistoryEntry,
} from '@/lib/candidates-api';
import { pipelineStagesApi, PipelineStage, communicationTemplatesApi, CommunicationTemplate } from '@/lib/pipeline-api';
import { interviewsApi, Interview } from '@/lib/interviews-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { InterviewDrawer } from '@/components/recruitment/interview-drawer';
import { InterviewFeedbackModal } from '@/components/recruitment/interview-feedback-modal';

const STATUS_STYLES: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  under_review: 'bg-amber-50 text-amber-700',
  shortlisted: 'bg-violet-50 text-violet-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
  hired: 'bg-emerald-50 text-emerald-700',
};

const INTERVIEW_STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  rescheduled: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  no_show: 'bg-slate-100 text-slate-600',
};

function communicationChannelLabel(channel: CandidateCommunication['channel']) {
  return channel === 'phone_note' ? 'Phone note' : channel.replace(/_/g, ' ');
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function PipelineApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [application, setApplication] = useState<Application | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [screening, setScreening] = useState<CandidateScreening | null>(null);
  const [assessments, setAssessments] = useState<CandidateAssessment[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [evaluations, setEvaluations] = useState<CandidateEvaluation[]>([]);
  const [communications, setCommunications] = useState<CandidateCommunication[]>([]);
  const [stageHistory, setStageHistory] = useState<PipelineStageHistoryEntry[]>([]);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInterviewDrawer, setShowInterviewDrawer] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Interview | null>(null);

  const load = useCallback(async () => {
    const [app, st, scr, assess, intv, evals, comms, hist] = await Promise.all([
      applicationsApi.get(id), pipelineStagesApi.list(), applicationsApi.screening.get(id),
      applicationsApi.assessments.list(id), interviewsApi.list({ application_id: id, limit: 100 }),
      applicationsApi.evaluations.list(id), applicationsApi.communications.list(id), applicationsApi.stageHistory(id),
    ]);
    setApplication(app); setStages(st); setScreening(scr); setAssessments(assess);
    setInterviews(intv.data); setEvaluations(evals); setCommunications(comms); setStageHistory(hist);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { communicationTemplatesApi.list().then(setTemplates); }, []);

  const moveStage = async (toStageId: string) => {
    if (!toStageId) return;
    await applicationsApi.moveStage(id, toStageId);
    load();
  };

  if (loading || !application) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {showInterviewDrawer && (
        <InterviewDrawer applicationId={id} onClose={() => setShowInterviewDrawer(false)} onSaved={load} />
      )}
      {rescheduleTarget && (
        <InterviewDrawer rescheduling={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onSaved={load} />
      )}
      {feedbackTarget && (
        <InterviewFeedbackModal interview={feedbackTarget} onClose={() => setFeedbackTarget(null)} onSaved={load} />
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/pipeline')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{application.first_name} {application.last_name}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[application.status] || 'bg-gray-100'}`}>{application.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {application.job_title} • {application.candidate_email} {application.candidate_phone ? `• ${application.candidate_phone}` : ''}
            </p>
          </div>
        </div>

        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Stage:</span>
            <select
              value={application.current_stage_id || ''}
              onChange={(e) => moveStage(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm"
            >
              <option value="" disabled>Select stage…</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </Can>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ScreeningSection applicationId={id} screening={screening} onSaved={load} />
          <AssessmentsSection applicationId={id} assessments={assessments} onSaved={load} />
          <SectionCard
            title="Interviews"
            action={<Can permission={PERMISSIONS.RECRUITMENT_EDIT}><button onClick={() => setShowInterviewDrawer(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"><Plus className="w-3 h-3" /> Schedule</button></Can>}
          >
            {interviews.length === 0 ? <p className="text-xs text-muted-foreground">No interviews scheduled yet.</p> : (
              <div className="space-y-3">
                {interviews.map((iv) => (
                  <div key={iv.id} className="bg-muted/30 rounded-xl p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-medium capitalize">Round {iv.round_number} • {iv.round_type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{new Date(iv.scheduled_at).toLocaleString()} • {iv.interview_type.replace('_', ' ')}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${INTERVIEW_STATUS_STYLES[iv.status] || 'bg-gray-100'}`}>{iv.status.replace('_', ' ')}</span>
                    </div>
                    {!!iv.scorecard?.length && (
                      <p className="text-xs text-muted-foreground mt-2">{iv.scorecard.length} panelist{iv.scorecard.length > 1 ? 's' : ''} submitted feedback (avg rating {(iv.scorecard.reduce((s, e) => s + e.rating, 0) / iv.scorecard.length).toFixed(1)})</p>
                    )}
                    <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {['scheduled', 'rescheduled'].includes(iv.status) && (
                          <>
                            <button onClick={() => setRescheduleTarget(iv)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Reschedule</button>
                            <button onClick={() => setFeedbackTarget(iv)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Submit Feedback</button>
                            <button onClick={async () => { await interviewsApi.complete(iv.id, { feedback: window.prompt('Overall feedback (optional):') || undefined }); load(); }} className="text-xs border border-emerald-200 text-emerald-700 rounded-lg px-2 py-1 hover:bg-emerald-50 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Complete</button>
                            <button onClick={async () => { await interviewsApi.cancel(iv.id, window.prompt('Cancellation reason (optional):') || undefined); load(); }} className="text-xs border border-red-200 text-red-600 rounded-lg px-2 py-1 hover:bg-red-50 flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancel</button>
                          </>
                        )}
                      </div>
                    </Can>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          <EvaluationsSection applicationId={id} evaluations={evaluations} interviews={interviews} onSaved={load} />
          <CommunicationSection applicationId={id} communications={communications} templates={templates} onSaved={load} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Pipeline History">
            {stageHistory.length === 0 ? <p className="text-xs text-muted-foreground">No stage changes yet.</p> : (
              <div className="space-y-3">
                {stageHistory.map((h) => (
                  <div key={h.id} className="text-sm">
                    <p className="text-foreground font-medium">{h.from_stage_name ? `${h.from_stage_name} → ` : ''}{h.to_stage_name || 'Removed'}</p>
                    {h.comment && <p className="text-xs text-muted-foreground">{h.comment}</p>}
                    <p className="text-xs text-muted-foreground">{h.actor_email || 'System'} • {formatDistanceToNow(parseISO(h.created_at), { addSuffix: true })}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ScreeningSection({ applicationId, screening, onSaved }: { applicationId: string; screening: CandidateScreening | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    current_salary: screening?.current_salary?.toString() || '', expected_salary: screening?.expected_salary?.toString() || '',
    notice_period_days: screening?.notice_period_days?.toString() || '', availability_date: screening?.availability_date?.slice(0, 10) || '',
    communication_rating: screening?.communication_rating?.toString() || '3', recommendation: screening?.recommendation || 'proceed',
    notes: screening?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      current_salary: screening?.current_salary?.toString() || '', expected_salary: screening?.expected_salary?.toString() || '',
      notice_period_days: screening?.notice_period_days?.toString() || '', availability_date: screening?.availability_date?.slice(0, 10) || '',
      communication_rating: screening?.communication_rating?.toString() || '3', recommendation: screening?.recommendation || 'proceed',
      notes: screening?.notes || '',
    });
  }, [screening]);

  const save = async () => {
    setSaving(true);
    try {
      await applicationsApi.screening.upsert(applicationId, {
        current_salary: form.current_salary ? parseFloat(form.current_salary) : undefined,
        expected_salary: form.expected_salary ? parseFloat(form.expected_salary) : undefined,
        notice_period_days: form.notice_period_days ? parseInt(form.notice_period_days, 10) : undefined,
        availability_date: form.availability_date || undefined,
        communication_rating: parseInt(form.communication_rating, 10),
        recommendation: form.recommendation as any,
        notes: form.notes || undefined,
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <SectionCard title="HR Screening">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Current Salary</label>
          <input value={form.current_salary} onChange={(e) => setForm((f) => ({ ...f, current_salary: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Expected Salary</label>
          <input value={form.expected_salary} onChange={(e) => setForm((f) => ({ ...f, expected_salary: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Notice Period (days)</label>
          <input value={form.notice_period_days} onChange={(e) => setForm((f) => ({ ...f, notice_period_days: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Availability Date</label>
          <input type="date" value={form.availability_date} onChange={(e) => setForm((f) => ({ ...f, availability_date: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Communication (1–5)</label>
          <input type="number" min={1} max={5} value={form.communication_rating} onChange={(e) => setForm((f) => ({ ...f, communication_rating: e.target.value }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Recommendation</label>
          <select value={form.recommendation} onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value as typeof f.recommendation }))} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm capitalize">
            {['proceed', 'hold', 'reject'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="col-span-full">
          <label className="text-xs text-muted-foreground block mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
        </div>
      </div>
      {screening?.screened_at && <p className="text-xs text-muted-foreground mt-2">Last screened by {screening.screened_by_email} • {formatDistanceToNow(parseISO(screening.screened_at), { addSuffix: true })}</p>}
      <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
        <button onClick={save} disabled={saving} className="mt-3 flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Screening
        </button>
      </Can>
    </SectionCard>
  );
}

function AssessmentsSection({ applicationId, assessments, onSaved }: { applicationId: string; assessments: CandidateAssessment[]; onSaved: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newAssessment, setNewAssessment] = useState({ assessment_type: 'technical', title: '', instructions: '', max_score: '100' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ score: '', result: 'pass', evaluation_notes: '' });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!newAssessment.title.trim()) return;
    setSaving(true);
    try {
      await applicationsApi.assessments.create(applicationId, {
        assessment_type: newAssessment.assessment_type as any, title: newAssessment.title,
        instructions: newAssessment.instructions || undefined, max_score: parseFloat(newAssessment.max_score) || 100,
      });
      setShowCreate(false);
      setNewAssessment({ assessment_type: 'technical', title: '', instructions: '', max_score: '100' });
      onSaved();
    } finally { setSaving(false); }
  };

  const startEvaluate = (a: CandidateAssessment) => {
    setEditingId(a.id);
    setEditForm({ score: a.score?.toString() || '', result: a.result || 'pass', evaluation_notes: a.evaluation_notes || '' });
  };

  const saveEvaluation = async (assessmentId: string) => {
    setSaving(true);
    try {
      await applicationsApi.assessments.update(assessmentId, {
        status: 'evaluated', score: editForm.score ? parseFloat(editForm.score) : undefined,
        result: editForm.result as any, evaluation_notes: editForm.evaluation_notes || undefined,
      } as any);
      setEditingId(null);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <SectionCard
      title="Assessments"
      action={<Can permission={PERMISSIONS.RECRUITMENT_EDIT}><button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"><Plus className="w-3 h-3" /> Assign</button></Can>}
    >
      {showCreate && (
        <div className="bg-muted/30 rounded-xl p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={newAssessment.assessment_type} onChange={(e) => setNewAssessment((f) => ({ ...f, assessment_type: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm">
              {['technical', 'coding', 'assignment', 'case_study', 'language_test', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <input value={newAssessment.max_score} onChange={(e) => setNewAssessment((f) => ({ ...f, max_score: e.target.value }))} placeholder="Max score" className="border border-border rounded-lg px-2.5 py-2 text-sm" />
          </div>
          <input value={newAssessment.title} onChange={(e) => setNewAssessment((f) => ({ ...f, title: e.target.value }))} placeholder="Title" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
          <textarea value={newAssessment.instructions} onChange={(e) => setNewAssessment((f) => ({ ...f, instructions: e.target.value }))} placeholder="Instructions (optional)" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
          <button onClick={create} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Assign Assessment</button>
        </div>
      )}
      {assessments.length === 0 ? <p className="text-xs text-muted-foreground">No assessments assigned yet.</p> : (
        <div className="space-y-2">
          {assessments.map((a) => (
            <div key={a.id} className="bg-muted/30 rounded-xl p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium">{a.title} <span className="text-xs text-muted-foreground capitalize">({a.assessment_type.replace('_', ' ')})</span></p>
                  <p className="text-xs text-muted-foreground">Status: {a.status.replace('_', ' ')} {a.score !== null ? `• Score: ${a.score}/${a.max_score}` : ''} {a.result ? `• ${a.result}` : ''}</p>
                </div>
                <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                  <button onClick={() => startEvaluate(a)} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted">Evaluate</button>
                </Can>
              </div>
              {editingId === a.id && (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editForm.score} onChange={(e) => setEditForm((f) => ({ ...f, score: e.target.value }))} placeholder={`Score (/${a.max_score})`} className="border border-border rounded-lg px-2.5 py-2 text-sm" />
                    <select value={editForm.result} onChange={(e) => setEditForm((f) => ({ ...f, result: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm">
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </div>
                  <textarea value={editForm.evaluation_notes} onChange={(e) => setEditForm((f) => ({ ...f, evaluation_notes: e.target.value }))} placeholder="Evaluation notes" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => saveEvaluation(a.id)} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditingId(null)} className="border border-border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function EvaluationsSection({ applicationId, evaluations, interviews, onSaved }: { applicationId: string; evaluations: CandidateEvaluation[]; interviews: Interview[]; onSaved: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ evaluation_type: 'technical', interview_id: '', overall_rating: '3', strengths: '', concerns: '', recommendation: 'neutral' });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      await applicationsApi.evaluations.create(applicationId, {
        evaluation_type: form.evaluation_type as any, interview_id: form.interview_id || undefined,
        overall_rating: parseFloat(form.overall_rating), strengths: form.strengths || undefined,
        concerns: form.concerns || undefined, recommendation: form.recommendation as any,
      });
      setShowCreate(false);
      setForm({ evaluation_type: 'technical', interview_id: '', overall_rating: '3', strengths: '', concerns: '', recommendation: 'neutral' });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <SectionCard
      title="Evaluations"
      action={<Can permission={PERMISSIONS.RECRUITMENT_EDIT}><button onClick={() => setShowCreate((v) => !v)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"><Plus className="w-3 h-3" /> Add Evaluation</button></Can>}
    >
      {showCreate && (
        <div className="bg-muted/30 rounded-xl p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.evaluation_type} onChange={(e) => setForm((f) => ({ ...f, evaluation_type: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm">
              {['technical', 'hr', 'behavioural', 'communication', 'leadership', 'culture_fit', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <select value={form.interview_id} onChange={(e) => setForm((f) => ({ ...f, interview_id: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm">
              <option value="">No linked interview</option>
              {interviews.map((iv) => <option key={iv.id} value={iv.id}>Round {iv.round_number} — {iv.round_type}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.overall_rating} onChange={(e) => setForm((f) => ({ ...f, overall_rating: e.target.value }))} placeholder="Overall rating (1-5)" className="border border-border rounded-lg px-2.5 py-2 text-sm" />
            <select value={form.recommendation} onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))} className="border border-border rounded-lg px-2.5 py-2 text-sm capitalize">
              {['strong_yes', 'yes', 'neutral', 'no', 'strong_no'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <textarea value={form.strengths} onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))} placeholder="Strengths" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
          <textarea value={form.concerns} onChange={(e) => setForm((f) => ({ ...f, concerns: e.target.value }))} placeholder="Concerns" rows={2} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
          <button onClick={create} disabled={saving} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Save Evaluation</button>
        </div>
      )}
      {evaluations.length === 0 ? <p className="text-xs text-muted-foreground">No evaluations recorded yet.</p> : (
        <div className="space-y-2">
          {evaluations.map((e) => (
            <div key={e.id} className="bg-muted/30 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium capitalize">{e.evaluation_type.replace('_', ' ')} • {e.reviewer_email}</p>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white capitalize">{e.recommendation.replace('_', ' ')}</span>
              </div>
              {e.overall_rating !== null && <p className="text-xs text-muted-foreground">Overall: {e.overall_rating}/5</p>}
              {e.strengths && <p className="text-xs text-muted-foreground mt-1">Strengths: {e.strengths}</p>}
              {e.concerns && <p className="text-xs text-muted-foreground">Concerns: {e.concerns}</p>}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function CommunicationSection({ applicationId, communications, templates, onSaved }: { applicationId: string; communications: CandidateCommunication[]; templates: CommunicationTemplate[]; onSaved: () => void }) {
  const [showSend, setShowSend] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  };

  const send = async () => {
    setSending(true);
    try {
      await applicationsApi.communications.send(applicationId, { template_id: templateId || undefined, subject, body });
      setShowSend(false);
      setTemplateId(''); setSubject(''); setBody('');
      onSaved();
    } finally { setSending(false); }
  };

  return (
    <SectionCard
      title="Candidate Communication"
      action={<Can permission={PERMISSIONS.RECRUITMENT_EDIT}><button onClick={() => setShowSend((v) => !v)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-primary/90"><Send className="w-3 h-3" /> Send</button></Can>}
    >
      {showSend && (
        <div className="bg-muted/30 rounded-xl p-3 mb-3 space-y-2">
          <select value={templateId} onChange={(e) => pickTemplate(e.target.value)} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm">
            <option value="">Custom message (no template)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full border border-border rounded-lg px-2.5 py-2 text-sm" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body — supports {{candidate_name}}, {{job_title}}, {{company_name}}" rows={4} className="w-full border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
          <button onClick={send} disabled={sending || !subject || !body} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Send Email</button>
        </div>
      )}
      {communications.length === 0 ? <p className="text-xs text-muted-foreground">No communication sent yet.</p> : (
        <div className="space-y-2">
          {communications.map((c) => (
            <div key={c.id} className="flex items-start justify-between bg-muted/30 rounded-xl p-3 gap-3">
              <div className="flex items-start gap-2">
                <ClipboardList className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{c.subject}</p>
                  <p className="text-xs capitalize text-muted-foreground">{communicationChannelLabel(c.channel)} - {c.sent_by_email || 'System'} - {formatDistanceToNow(parseISO(c.sent_at), { addSuffix: true })}</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${c.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
