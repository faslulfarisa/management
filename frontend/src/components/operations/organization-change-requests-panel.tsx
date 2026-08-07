'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { organizationChangeRequestApi, OrganizationChangeRequest } from '@/lib/organization-registration-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'documents_requested', label: 'Documents Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  documents_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const FIELD_LABELS: Record<string, string> = {
  legalName: 'Legal Company Name',
  tradeName: 'Trade Name',
  registrationNumber: 'Registration Number',
  gstin: 'GST Number',
  panNumber: 'PAN Number',
  cinNumber: 'CIN Number',
  companyType: 'Company Type',
};

export function OrganizationChangeRequestsPanel() {
  const [tab, setTab] = useState('');
  const [requests, setRequests] = useState<OrganizationChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrganizationChangeRequest | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    organizationChangeRequestApi.listAll(tab || undefined).then(setRequests).finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Organization Change Requests</h2>
          <p className="text-sm text-muted-foreground">Protected company information changes requested by organization admins.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              {['Organization', 'Fields', 'Reason', 'Status', 'Requested', ''].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary/50 inline-block" /></TableCell></TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No change requests found.</TableCell></TableRow>
            ) : requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm font-medium text-foreground">{r.tenant_legal_name || r.tenant_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{Object.keys(r.changes).map((k) => FIELD_LABELS[k] || k).join(', ')}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.reason}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => setSelected(r)}
                    className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted text-foreground transition-colors"
                  >
                    Review
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <ReviewDialog request={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load(); }} />
      )}
    </div>
  );
}

function ReviewDialog({ request, onClose, onDone }: { request: OrganizationChangeRequest; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (action: 'approve' | 'reject' | 'request_documents') => {
    if ((action === 'reject' || action === 'request_documents') && !notes.trim()) {
      setError('Please provide notes for this decision.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await organizationChangeRequestApi.transition(request.id, action, notes || undefined);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{request.tenant_legal_name || request.tenant_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {Object.entries(request.changes).map(([key, change]) => (
            <div key={key} className="rounded-lg border border-border px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[key] || key}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground line-through">{change.old || '—'}</span>
                <span>→</span>
                <span className="font-medium text-foreground">{change.new}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Reason given</div>
          {request.reason}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Decision notes (required for Reject / Request Documents)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            onClick={() => act('request_documents')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors"
          >
            Request Documents
          </button>
          <button
            onClick={() => act('reject')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
          >
            <X className="h-4 w-4" /> Reject
          </button>
          <button
            onClick={() => act('approve')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" /> Approve
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
