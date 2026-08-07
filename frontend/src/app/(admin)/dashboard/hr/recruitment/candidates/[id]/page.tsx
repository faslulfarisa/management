'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { candidatesApi, applicationsApi, Candidate, Application } from '@/lib/candidates-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CandidateResumes } from '@/components/recruitment/candidate-resumes';

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
  return (<div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm text-foreground font-medium">{value ?? '—'}</p></div>);
}

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const load = async () => {
    const [c, apps] = await Promise.all([candidatesApi.get(id), candidatesApi.applications(id)]);
    setCandidate(c);
    setNotes(c.notes || '');
    setApplications(apps.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try { await candidatesApi.update(id, { notes } as any); } finally { setSavingNotes(false); }
  };

  const updateStatus = async (appId: string, status: Application['status']) => {
    if (status === 'rejected') {
      const reason = window.prompt('Rejection reason (optional):') || undefined;
      await applicationsApi.updateStatus(appId, status, reason);
    } else {
      await applicationsApi.updateStatus(appId, status);
    }
    load();
  };

  if (loading || !candidate) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/dashboard/hr/recruitment/candidates')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{candidate.first_name} {candidate.last_name}</h1>
          <p className="text-sm text-muted-foreground">{candidate.email} {candidate.phone ? `• ${candidate.phone}` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Current Company" value={candidate.current_company} />
              <Field label="Current Role" value={candidate.current_designation} />
              <Field label="Experience" value={candidate.experience_years ? `${candidate.experience_years} yrs` : null} />
              <Field label="Expected Salary" value={candidate.expected_salary ? `₹${candidate.expected_salary}` : null} />
              <Field label="Source" value={candidate.source} />
              <Field label="Gender" value={candidate.gender} />
              {!!candidate.skills?.length && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1.5">{candidate.skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-muted/60 rounded-full text-xs">{s}</span>)}</div>
                </div>
              )}
              {!!candidate.education?.length && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Education</p>
                  {candidate.education.map((e, i) => <p key={i} className="text-sm">{e.degree} — {e.institution} {e.year ? `(${e.year})` : ''}</p>)}
                </div>
              )}
              {!!candidate.experience?.length && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">Experience</p>
                  {candidate.experience.map((e, i) => <p key={i} className="text-sm">{e.title} at {e.company} {e.from ? `(${e.from} – ${e.to || 'present'})` : ''}</p>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Applications</h3>
              {applications.length === 0 ? (
                <p className="text-xs text-muted-foreground">No applications yet.</p>
              ) : (
                <div className="space-y-3">
                  {applications.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium">{a.job_title}</p>
                        <p className="text-xs text-muted-foreground">Applied {formatDistanceToNow(parseISO(a.applied_at), { addSuffix: true })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[a.status] || 'bg-gray-100'}`}>{a.status.replace('_', ' ')}</span>
                        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                          {STATUS_FLOW[a.status]?.map((next) => (
                            <button key={next} onClick={() => updateStatus(a.id, next as Application['status'])} className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-muted capitalize">
                              {next.replace('_', ' ')}
                            </button>
                          ))}
                        </Can>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <CandidateResumes candidateId={candidate.id} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent className="p-5 space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                <button onClick={saveNotes} disabled={savingNotes} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                  {savingNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Notes
                </button>
              </Can>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
