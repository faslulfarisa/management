'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { careerPortalApi, PublicJobDetail, PublicOrganization } from '@/lib/career-portal-api';

function TagList({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc list-inside text-sm text-foreground space-y-1">
      {items.map((i, idx) => <li key={idx}>{typeof i === 'string' ? i : JSON.stringify(i)}</li>)}
    </ul>
  );
}

export default function CareerJobDetailPage() {
  const { slug, jobId } = useParams<{ slug: string; jobId: string }>();
  const router = useRouter();
  const [organization, setOrganization] = useState<PublicOrganization | null>(null);
  const [job, setJob] = useState<PublicJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState<{ applicationId: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', current_company: '', current_designation: '', experience_years: '', expected_salary: '', cover_note: '' });

  useEffect(() => {
    careerPortalApi.getJob(slug, jobId)
      .then((r) => { setOrganization(r.organization); setJob(r.job); })
      .catch(() => setError('This job is no longer accepting applications.'))
      .finally(() => setLoading(false));
  }, [slug, jobId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setSubmitError('Name and email are required');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await careerPortalApi.apply(slug, jobId, { ...form, resume: file || undefined });
      setResult(data);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || err.response?.data?.error || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error || !job) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">{error}</div>;

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-bold">Application submitted!</h1>
          <p className="text-sm text-muted-foreground">Thank you for applying to {job.title} at {organization?.name}. We'll be in touch.</p>
          <p className="text-xs text-muted-foreground">Reference: <code>{result.applicationId}</code></p>
          <button onClick={() => router.push(`/career/${slug}/applications/${result.applicationId}`)} className="text-sm text-primary hover:underline">
            Check application status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.push(`/career/${slug}`)} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <p className="text-sm font-medium">{organization?.name}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{job.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {job.department_name} {job.work_location ? `• ${job.work_location}` : ''} {job.employment_type_name ? `• ${job.employment_type_name}` : ''}
          </p>
        </div>

        {!showApply ? (
          <>
            {job.summary && <p className="text-sm text-foreground">{job.summary}</p>}
            {job.responsibilities && (
              <div><h2 className="text-sm font-semibold mb-2">Responsibilities</h2><p className="text-sm whitespace-pre-line">{job.responsibilities}</p></div>
            )}
            {!!job.skills?.length && (<div><h2 className="text-sm font-semibold mb-2">Skills</h2><TagList items={job.skills} /></div>)}
            {!!job.benefits?.length && (<div><h2 className="text-sm font-semibold mb-2">Benefits</h2><TagList items={job.benefits} /></div>)}
            {job.qualifications && (<div><h2 className="text-sm font-semibold mb-2">Qualifications</h2><p className="text-sm">{job.qualifications}</p></div>)}
            <button onClick={() => setShowApply(true)} className="bg-primary text-white rounded-xl px-5 py-3 text-sm font-semibold hover:bg-primary/90">Apply Now</button>
          </>
        ) : (
          <div className="max-w-md space-y-4">
            {submitError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{submitError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">First Name *</label><input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">Last Name *</label><input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground block mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            <div><label className="text-xs font-medium text-muted-foreground block mb-1">Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">Current Company</label><input value={form.current_company} onChange={(e) => set('current_company', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">Current Role</label><input value={form.current_designation} onChange={(e) => set('current_designation', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">Experience (yrs)</label><input type="number" min="0" value={form.experience_years} onChange={(e) => set('experience_years', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs font-medium text-muted-foreground block mb-1">Expected Salary (₹)</label><input type="number" min="0" value={form.expected_salary} onChange={(e) => set('expected_salary', e.target.value)} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Resume</label>
              <label className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-1 text-sm text-muted-foreground cursor-pointer">
                <Upload className="w-4 h-4" />
                {file ? file.name : 'Click to upload your resume'}
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
              </label>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cover Note</label>
              <textarea value={form.cover_note} onChange={(e) => set('cover_note', e.target.value)} rows={3} className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowApply(false)} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Back</button>
              <button onClick={submit} disabled={submitting} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit Application
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
