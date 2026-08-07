'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { careerPortalApi } from '@/lib/career-portal-api';

export default function CareerApplicationStatusPage() {
  const { slug, applicationId } = useParams<{ slug: string; applicationId: string }>();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<any>(null);

  const check = async () => {
    if (!email.trim()) { setError('Enter the email you applied with'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await careerPortalApi.getApplicationStatus(slug, applicationId, email.trim());
      setStatus(data);
    } catch {
      setError('No application found for that email.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold text-center">Check Application Status</h1>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email used to apply"
            onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}
        <button onClick={check} disabled={loading} className="w-full bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Check Status
        </button>
        {status && (
          <div className="bg-muted/30 rounded-xl p-4 text-center space-y-1">
            <p className="text-sm font-medium">{status.job_title}</p>
            <p className="text-sm capitalize">{status.status.replace('_', ' ')}</p>
            <p className="text-xs text-muted-foreground">Applied {new Date(status.applied_at).toLocaleDateString()}</p>
            {status.status === 'hired' && (
              <button
                onClick={() => router.push(`/career/${slug}/applications/${applicationId}/preboarding?email=${encodeURIComponent(email)}`)}
                className="w-full mt-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90"
              >
                Complete Preboarding
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
