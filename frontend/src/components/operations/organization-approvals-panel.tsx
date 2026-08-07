'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, Building2, Calendar, Check, Clock3, Loader2, Mail, MessageSquare, Phone, RefreshCw, ShieldCheck, X,
} from 'lucide-react';
import {
  organizationApprovalApi, PendingOrganizationSummary, OrganizationApprovalStats, ApprovalAction,
} from '@/lib/organization-registration-api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TABS: { value: string; label: string }[] = [
  { value: '', label: 'All Active' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'under_discussion', label: 'Under Discussion' },
  { value: 'needs_clarification', label: 'Needs Clarification' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  under_discussion: 'bg-blue-50 text-blue-700 border-blue-200',
  needs_clarification: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

function StatTile({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function OrganizationApprovalsPanel() {
  const [tab, setTab] = useState('');
  const [orgs, setOrgs] = useState<PendingOrganizationSummary[]>([]);
  const [stats, setStats] = useState<OrganizationApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingOrganizationSummary | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([organizationApprovalApi.list(tab || undefined), organizationApprovalApi.stats()])
      .then(([list, s]) => { setOrgs(list); setStats(s); })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Organization Approvals</h2>
          <p className="text-sm text-muted-foreground">Review and approve self-registered organizations.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatTile label="New Registrations (7d)" value={stats.newRegistrations} icon={Building2} color="text-blue-600 bg-blue-500/10" />
          <StatTile label="Pending Approvals" value={stats.pendingApprovals} icon={Clock3} color="text-amber-600 bg-amber-500/10" />
          <StatTile label="Awaiting Contact" value={stats.awaitingContact} icon={Phone} color="text-orange-600 bg-orange-500/10" />
          <StatTile label="Awaiting Activation" value={stats.awaitingActivation} icon={ShieldCheck} color="text-teal-600 bg-teal-500/10" />
          <StatTile label="Change Requests Pending" value={stats.changeRequestsPending} icon={MessageSquare} color="text-purple-600 bg-purple-500/10" />
        </div>
      )}

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
              {['Organization', 'Contact', 'Branches / Employees', 'Status', 'Submitted', ''].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary/50 inline-block" /></TableCell></TableRow>
            ) : orgs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No organizations found.</TableCell></TableRow>
            ) : orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{org.legal_name || org.name}</div>
                  {org.trade_name && <div className="text-xs text-muted-foreground">{org.trade_name}</div>}
                </TableCell>
                <TableCell>
                  <div className="text-sm text-foreground">{org.contact_person_name}</div>
                  <div className="text-xs text-muted-foreground">{org.contact_person_mobile || org.phone_number}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {org.estimated_branch_count ?? '—'} / {org.estimated_employee_count ?? '—'}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[org.approval_status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                    {org.approval_status.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {org.submitted_at ? new Date(org.submitted_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => setSelected(org)}
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
        <ReviewDialog
          org={selected}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

function ReviewDialog({ org, onClose, onDone }: { org: PendingOrganizationSummary; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const [demoAt, setDemoAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (action: ApprovalAction) => {
    if ((action === 'reject' || action === 'request_info') && !notes.trim()) {
      setError('Please provide a reason in the notes field.');
      return;
    }
    if (action === 'schedule_demo' && !demoAt) {
      setError('Please pick a demo date/time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await organizationApprovalApi.transition(org.id, action, notes || undefined, demoAt || undefined);
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
          <DialogTitle>{org.legal_name || org.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <DetailRow icon={Building2} label="Trade name" value={org.trade_name} />
          <DetailRow icon={Mail} label="Corporate email" value={org.primary_email} />
          <DetailRow icon={Phone} label="Phone" value={org.phone_number} />
          <DetailRow icon={Building2} label="Contact person" value={`${org.contact_person_name ?? ''} — ${org.contact_person_mobile ?? ''} / ${org.contact_person_email ?? ''}`} />
          <DetailRow icon={Building2} label="Branches / Employees" value={`${org.estimated_branch_count ?? '—'} / ${org.estimated_employee_count ?? '—'}`} />
          {org.rejection_reason && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Last note: {org.rejection_reason}</div>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Notes (required for Reject / Request Info)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add context for this decision…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="datetime-local"
            value={demoAt}
            onChange={(e) => setDemoAt(e.target.value)}
            className="max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
          <button
            onClick={() => act('schedule_demo')}
            disabled={busy}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors"
          >
            Schedule Demo
          </button>
        </div>

        {org.contact_person_email && (
          <a href={`mailto:${org.contact_person_email}`} className="text-xs font-medium text-primary hover:underline">
            Contact Customer ({org.contact_person_email})
          </a>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            onClick={() => act('under_discussion')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors"
          >
            <MessageSquare className="h-4 w-4" /> Under Discussion
          </button>
          <button
            onClick={() => act('request_info')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 transition-colors"
          >
            Request More Info
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

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{value || '—'}</div>
      </div>
    </div>
  );
}
