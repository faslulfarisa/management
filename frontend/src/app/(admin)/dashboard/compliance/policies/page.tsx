'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';
import { complianceDocumentsApi, compliancePolicyApi, ComplianceDocument } from '@/lib/compliance-api';
import { DocumentExplorer } from '@/components/compliance/document-explorer';

function MyPendingAcknowledgements() {
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    compliancePolicyApi.myPending().then(setPending).catch(() => setPending([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const acknowledge = async (documentId: string) => {
    await compliancePolicyApi.acknowledge(documentId);
    load();
  };

  if (loading) return null;
  if (pending.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle>Policies Awaiting Your Acknowledgement</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {pending.map((p) => (
          <div key={p.id} className="flex items-center justify-between border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{p.title}</p>
              {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
            </div>
            <button onClick={() => acknowledge(p.document_id)} className="inline-flex items-center gap-1.5 bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-primary/90">
              <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PublishAndTrack() {
  const [policies, setPolicies] = useState<ComplianceDocument[]>([]);
  const [selected, setSelected] = useState('');
  const [acks, setAcks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    complianceDocumentsApi.list({ scope: 'company', groupLabel: 'Policy', limit: 200 }).then((r) => setPolicies(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) compliancePolicyApi.getAcknowledgements(selected).then(setAcks).catch(() => setAcks([]));
    else setAcks([]);
  }, [selected]);

  const publish = async () => {
    if (!selected) return;
    setBusy(true);
    try { await compliancePolicyApi.publish(selected); const acks2 = await compliancePolicyApi.getAcknowledgements(selected); setAcks(acks2); }
    catch { alert('Failed to publish policy'); }
    finally { setBusy(false); }
  };

  const acknowledgedCount = acks.filter((a) => a.status === 'acknowledged').length;

  return (
    <Card>
      <CardHeader><CardTitle>Publish & Track Acknowledgement</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm flex-1 max-w-sm">
            <option value="">Select a policy document…</option>
            {policies.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button disabled={!selected || busy} onClick={publish} className="inline-flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publish & Notify
          </button>
        </div>
        {selected && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">{acknowledgedCount} of {acks.length} employees acknowledged</p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {acks.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1.5">
                  <span>{a.first_name} {a.last_name} ({a.employee_code})</span>
                  <span className={a.status === 'acknowledged' ? 'text-green-600' : 'text-amber-600'}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PolicyManagementPage() {
  const { userType } = useAuthStore();
  const isAdmin = isAtLeast(userType, 'admin');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Policy Management</h1>
        <p className="text-muted-foreground">HR policies with version control, publishing, and employee acknowledgement tracking</p>
      </div>

      <MyPendingAcknowledgements />
      {isAdmin && <PublishAndTrack />}

      <DocumentExplorer scope="company" groupLabels={['Policy']} title="Policy Documents" allowCreate={isAdmin} />
    </div>
  );
}
