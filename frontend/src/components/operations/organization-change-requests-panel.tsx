'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  additionalOrganization: 'Additional Organization',
  legalName: 'Legal Company Name',
  tradeName: 'Trade Name',
  registrationNumber: 'Registration Number',
  gstin: 'GST Number',
  panNumber: 'PAN Number',
  cinNumber: 'CIN Number',
  companyType: 'Company Type',
};

function isAdditionalOrganizationRequest(request: OrganizationChangeRequest) {
  return !!request.changes.additionalOrganization;
}

function getRequestTypeLabel(request: OrganizationChangeRequest) {
  if (isAdditionalOrganizationRequest(request)) return 'Additional organization';
  if (request.changes?.requestType === 'plan_upgrade') return 'Plan Upgrade';
  return Object.keys(request.changes).map((key) => FIELD_LABELS[key] || key).join(', ');
}

function getAdditionalOrganizationDetails(request: OrganizationChangeRequest) {
  return request.changes.additionalOrganization?.new ?? {};
}

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
          <h2 className="text-lg font-bold text-foreground">Organization Requests</h2>
          <p className="text-sm text-muted-foreground">Review protected company changes and additional organization requests.</p>
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
              {['Organization', 'Request', 'Reason', 'Status', 'Requested', ''].map((heading) => (
                <TableHead key={heading}>{heading}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/50 inline-block" />
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No requests found.</TableCell></TableRow>
            ) : requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="text-sm font-medium text-foreground">{request.tenant_legal_name || request.tenant_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{getRequestTypeLabel(request)}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{request.reason}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[request.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                    {request.status.replace('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(request.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => setSelected(request)}
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
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const additionalOrganization = isAdditionalOrganizationRequest(request);
  const additionalDetails = getAdditionalOrganizationDetails(request);
  const supportingResponses = request.supporting_documents?.responses ?? [];

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

  const startAdditionalOrganizationCreation = () => {
    router.push(`/operations/organizations/new?sourceRequestId=${request.id}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{request.tenant_legal_name || request.tenant_name}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {additionalOrganization ? (
            <div className="rounded-lg border border-border px-3 py-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-2">Additional organization request</div>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Organization:</span> <span className="font-medium text-foreground">{additionalDetails.organizationName}</span></div>
                {additionalDetails.companyType && <div><span className="text-muted-foreground">Company type:</span> {additionalDetails.companyType}</div>}
                {additionalDetails.registrationNumber && <div><span className="text-muted-foreground">Registration:</span> {additionalDetails.registrationNumber}</div>}
                {additionalDetails.gstin && <div><span className="text-muted-foreground">GST:</span> {additionalDetails.gstin}</div>}
                {additionalDetails.panNumber && <div><span className="text-muted-foreground">PAN:</span> {additionalDetails.panNumber}</div>}
                {additionalDetails.phoneNumber && <div><span className="text-muted-foreground">Organization phone:</span> {additionalDetails.phoneNumber}</div>}
                {additionalDetails.estimatedBranchCount != null && <div><span className="text-muted-foreground">Branches:</span> {additionalDetails.estimatedBranchCount}</div>}
                {additionalDetails.estimatedEmployeeCount != null && <div><span className="text-muted-foreground">Employees:</span> {additionalDetails.estimatedEmployeeCount}</div>}
                {additionalDetails.contactName && <div><span className="text-muted-foreground">Contact:</span> {additionalDetails.contactName}</div>}
                {additionalDetails.contactEmail && <div><span className="text-muted-foreground">Email:</span> {additionalDetails.contactEmail}</div>}
                {additionalDetails.contactPhone && <div><span className="text-muted-foreground">Phone:</span> {additionalDetails.contactPhone}</div>}
                {additionalDetails.otherDetails && <div><span className="text-muted-foreground">Other details:</span> {additionalDetails.otherDetails}</div>}
              </div>
            </div>
          ) : request.changes?.requestType === 'plan_upgrade' ? (
            <div className="rounded-lg border border-border px-3 py-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-2">Plan upgrade request</div>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Requested Plan:</span> <span className="font-medium text-foreground">{request.changes.plan_name || request.changes.plan_id}</span></div>
                <div><span className="text-muted-foreground">Billing Cycle:</span> <span className="capitalize">{request.changes.billing_cycle}</span></div>
                {Array.isArray(request.changes.selected_modules) && request.changes.selected_modules.length > 0 && (
                  <div><span className="text-muted-foreground">Modules:</span> {request.changes.selected_modules.join(', ')}</div>
                )}
                {Array.isArray(request.changes.selected_features) && request.changes.selected_features.length > 0 && (
                  <div><span className="text-muted-foreground">Features:</span> {request.changes.selected_features.join(', ')}</div>
                )}
                {request.changes.resource_quantities && Object.keys(request.changes.resource_quantities).length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Resources:</span>{' '}
                    {Object.entries(request.changes.resource_quantities)
                      .map(([key, val]) => `${key}: ${val}`)
                      .join(', ')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(request.changes).map(([key, change]) => (
                <div key={key} className="rounded-lg border border-border px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[key] || key}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground line-through">{(change as any).old || '-'}</span>
                    <span>-&gt;</span>
                    <span className="font-medium text-foreground">{String((change as any).new)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Reason given</div>
            {request.reason}
          </div>

          {supportingResponses.length > 0 && (
            <div className="rounded-lg border border-border px-3 py-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-2">Requester follow-up</div>
              <div className="space-y-3">
                {supportingResponses.map((response, index) => (
                  <div key={`${response.submittedAt ?? index}`} className="rounded-md bg-muted/40 px-3 py-2">
                    {response.submittedAt && (
                      <div className="mb-1 text-xs text-muted-foreground">
                        Submitted {new Date(response.submittedAt).toLocaleString()}
                      </div>
                    )}
                    {response.notes && <div className="text-sm text-foreground">{response.notes}</div>}
                    {!!response.documents?.length && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {response.documents.map((doc) => (
                          <a
                            key={doc.url}
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-primary hover:underline"
                          >
                            {doc.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Decision notes (required for Reject / Request Docs or Info)</label>
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
        </div>

        <DialogFooter className="grid shrink-0 grid-cols-1 gap-2 border-t border-border bg-white px-6 py-4 sm:grid-cols-3">
          <button
            onClick={() => act('request_documents')}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Request Docs / Info
          </button>
          <button
            onClick={() => act('reject')}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Reject
          </button>
          <button
            onClick={additionalOrganization ? startAdditionalOrganizationCreation : () => act('approve')}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {additionalOrganization ? 'Create Organization' : 'Approve'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
