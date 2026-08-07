'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { complianceDashboardApi } from '@/lib/compliance-api';
import { StatusBadge } from '@/components/compliance/badges';
import { DocumentDetailDrawer } from '@/components/compliance/document-detail-drawer';

const BUCKETS = [
  { label: 'Expired', test: (d: number) => d < 0 },
  { label: 'Due in 1 day', test: (d: number) => d === 0 || d === 1 },
  { label: 'Due in 7 days', test: (d: number) => d > 1 && d <= 7 },
  { label: 'Due in 15 days', test: (d: number) => d > 7 && d <= 15 },
  { label: 'Due in 30 days', test: (d: number) => d > 15 && d <= 30 },
  { label: 'Due in 60 days', test: (d: number) => d > 30 && d <= 60 },
  { label: 'Due in 90 days', test: (d: number) => d > 60 && d <= 90 },
];

export default function ExpiringDocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    complianceDashboardApi.getExpiryTimeline().then(setDocs).catch(() => setDocs([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const daysLeft = (expiry: string) => Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);

  return (
    <div className="space-y-5">
      {selectedId && <DocumentDetailDrawer documentId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
      <div>
        <h1 className="text-2xl font-bold">Expiring Documents</h1>
        <p className="text-muted-foreground">Company and employee documents grouped by how soon they expire</p>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : (
        BUCKETS.map((bucket) => {
          const rows = docs.filter((d) => bucket.test(daysLeft(d.expiry_date)));
          if (rows.length === 0) return null;
          return (
            <Card key={bucket.label}>
              <CardHeader><CardTitle className="text-base">{bucket.label} ({rows.length})</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {rows.map((d) => (
                  <div key={d.id} onClick={() => setSelectedId(d.id)} className="flex items-center justify-between text-sm border-b border-border/50 py-2 cursor-pointer hover:bg-muted/30 px-2 rounded-lg">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.scope === 'company' ? 'Company' : 'Employee'} · {d.category_group_label || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{new Date(d.expiry_date).toLocaleDateString('en-IN')}</span>
                      <StatusBadge status={d.status} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
      {!loading && docs.length === 0 && (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">No documents with an expiry date on record.</CardContent></Card>
      )}
    </div>
  );
}
