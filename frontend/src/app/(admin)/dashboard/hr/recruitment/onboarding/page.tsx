'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserCheck, Search } from 'lucide-react';
import { applicationsApi, Application } from '@/lib/candidates-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

export default function OnboardingPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicationsApi.list({ status: 'hired', q: q || undefined, page, limit: PAGE_SIZE });
      setApplications(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, [q, page]);

  useEffect(() => { setPage(1); }, [q]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Onboarding</h2>
        <p className="text-sm text-muted-foreground">Preboarding checklist, employee conversion, and probation tracking for hired candidates</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by candidate name or email…"
          className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : applications.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No hired candidates awaiting onboarding yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Hired</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/onboarding/${a.id}`)}>
                  <TableCell className="font-medium">{a.first_name} {a.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.job_title || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    {a.converted_employee_id ? (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><UserCheck className="w-3 h-3" /> Converted</span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Pending Conversion</span>
                    )}
                  </TableCell>
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
