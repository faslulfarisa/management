'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Briefcase, Loader2, MapPin, Search } from 'lucide-react';
import { careerPortalApi, PublicJobSummary, PublicOrganization } from '@/lib/career-portal-api';

export default function CareerJobListPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [organization, setOrganization] = useState<PublicOrganization | null>(null);
  const [jobs, setJobs] = useState<PublicJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    careerPortalApi.listJobs(slug, { q: q || undefined })
      .then((r) => { setOrganization(r.organization); setJobs(r.jobs); })
      .catch(() => setError('This careers page is not available.'))
      .finally(() => setLoading(false));
  }, [slug, q]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center gap-3">
          {organization?.logo_url ? (
            <img src={organization.logo_url} alt={organization.name} className="h-10 w-auto" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Briefcase className="w-5 h-5 text-primary" /></div>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground">{organization?.name || 'Careers'}</h1>
            <p className="text-xs text-muted-foreground">Open positions</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search open roles…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-center text-muted-foreground py-16">{error}</p>
        ) : jobs.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No open positions right now. Check back soon.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <button key={job.id} onClick={() => router.push(`/career/${slug}/jobs/${job.id}`)} className="w-full text-left bg-white border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{job.title}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      {job.department_name && <span>{job.department_name}</span>}
                      {job.work_location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.work_location}</span>}
                      {job.employment_type_name && <span>• {job.employment_type_name}</span>}
                    </p>
                  </div>
                  {(job.salary_min || job.salary_max) && (
                    <p className="text-sm text-muted-foreground shrink-0">₹{job.salary_min ?? '—'} - ₹{job.salary_max ?? '—'}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
