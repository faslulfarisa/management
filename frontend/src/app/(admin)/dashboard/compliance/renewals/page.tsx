'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { complianceDocumentsApi, ComplianceDocument } from '@/lib/compliance-api';
import { StatusBadge, ExpiryBadge } from '@/components/compliance/badges';
import { DocumentDetailDrawer } from '@/components/compliance/document-detail-drawer';

export default function RenewalsPage() {
  const [docs, setDocs] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pending, expired] = await Promise.all([
        complianceDocumentsApi.list({ status: 'renewal_pending', limit: 200 }),
        complianceDocumentsApi.list({ status: 'expired', limit: 200 }),
      ]);
      setDocs([...pending.data, ...expired.data]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      {selectedId && <DocumentDetailDrawer documentId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
      <div>
        <h1 className="text-2xl font-bold">Renewals</h1>
        <p className="text-muted-foreground">Documents expiring or expired and awaiting renewal — expiring → requested → manager approval → updated</p>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : docs.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">No documents currently need renewal.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {docs.map((d) => (
              <div key={d.id} onClick={() => setSelectedId(d.id)} className="flex items-center justify-between text-sm px-4 py-3 cursor-pointer hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 text-orange-500 shrink-0" />
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.scope === 'company' ? 'Company' : 'Employee'} · {d.category_name || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ExpiryBadge expiryDate={d.expiry_date} />
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
