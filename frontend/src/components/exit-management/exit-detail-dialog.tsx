'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exitApi } from '@/lib/exit-api';
import { assetApi } from '@/lib/asset-api';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { ExitStatusBadge } from './exit-status-badge';
import { ExitTimelineView } from './exit-timeline-view';
import {
  ExitRequest, ExitTimelineEvent, ExitChecklistItem, ExitClearance,
  ExitKnowledgeTransfer, ExitInterview, FinalSettlement, AssetAssignment,
} from '@/types/exit';

const TABS = ['timeline', 'checklist', 'clearances', 'kt', 'assets', 'interview', 'settlement'] as const;
type Tab = typeof TABS[number];

export function ExitDetailDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [exitRequest, setExitRequest] = useState<ExitRequest | null>(null);
  const [timeline, setTimeline] = useState<ExitTimelineEvent[]>([]);
  const [checklist, setChecklist] = useState<ExitChecklistItem[]>([]);
  const [clearances, setClearances] = useState<ExitClearance[]>([]);
  const [kt, setKt] = useState<ExitKnowledgeTransfer | null>(null);
  const [assets, setAssets] = useState<AssetAssignment[]>([]);
  const [interview, setInterview] = useState<ExitInterview | null>(null);
  const [settlement, setSettlement] = useState<FinalSettlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const canApprove = useCan(PERMISSIONS.EXIT_APPROVE);
  const canChecklist = useCan(PERMISSIONS.EXIT_CHECKLIST_MANAGE);
  const canClearance = useCan(PERMISSIONS.EXIT_CLEARANCE_MANAGE);
  const canCalculate = useCan(PERMISSIONS.EXIT_SETTLEMENT_CALCULATE);
  const canApproveSettlement = useCan(PERMISSIONS.EXIT_SETTLEMENT_APPROVE);
  const canPay = useCan(PERMISSIONS.EXIT_SETTLEMENT_PAY);
  const canRecoverAssets = useCan(PERMISSIONS.ASSETS_RECOVER);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [req, tl, cl, clr, ktData, assetData, intv, settle] = await Promise.all([
        exitApi.getRequest(id),
        exitApi.getTimeline(id),
        exitApi.getChecklist(id),
        exitApi.getClearances(id),
        exitApi.getKnowledgeTransfer(id),
        assetApi.listForExit(id),
        exitApi.getInterview(id),
        exitApi.getSettlementForRequest(id),
      ]);
      setExitRequest(req);
      setTimeline(tl);
      setChecklist(cl);
      setClearances(clr);
      setKt(ktData);
      setAssets(assetData);
      setInterview(intv);
      setSettlement(settle);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setTab('timeline'); load(); }, [id, load]);

  if (!id) return null;

  const refreshAfter = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {exitRequest ? `${exitRequest.first_name} ${exitRequest.last_name} (${exitRequest.employee_code})` : 'Exit Request'}
            {exitRequest && <ExitStatusBadge status={exitRequest.status} />}
          </DialogTitle>
        </DialogHeader>

        {exitRequest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-muted/30 rounded-lg p-3">
            <div><p className="text-muted-foreground text-xs">Type</p><p className="font-medium">{exitRequest.request_type.replace(/_/g, ' ')}</p></div>
            <div><p className="text-muted-foreground text-xs">Requested</p><p className="font-medium">{new Date(exitRequest.requested_date).toLocaleDateString()}</p></div>
            <div><p className="text-muted-foreground text-xs">Last Working Day</p><p className="font-medium">{new Date(exitRequest.last_working_date).toLocaleDateString()}</p></div>
            <div><p className="text-muted-foreground text-xs">Notice Period</p><p className="font-medium">{exitRequest.notice_period_days} days</p></div>
          </div>
        )}

        {exitRequest?.status === 'pending_approval' && canApprove && (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => refreshAfter(() => exitApi.approveRequest(id, 'Approved by HR'))}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => {
              const reason = window.prompt('Rejection reason:');
              if (reason) refreshAfter(() => exitApi.rejectRequest(id, reason));
            }}>Reject</Button>
          </div>
        )}

        <div className="flex gap-1 flex-wrap border-b border-border pb-2">
          {TABS.map((t) => (
            <Button key={t} size="sm" variant={tab === t ? 'default' : 'ghost'} onClick={() => setTab(t)} className="capitalize">
              {t === 'kt' ? 'Knowledge Transfer' : t}
            </Button>
          ))}
        </div>

        {tab === 'timeline' && <ExitTimelineView events={timeline} loading={loading} />}

        {tab === 'checklist' && (
          <ChecklistPanel exitRequestId={id} items={checklist} canManage={canChecklist} busy={busy} onChange={(fn) => refreshAfter(fn)} />
        )}

        {tab === 'clearances' && (
          <ClearancePanel items={clearances} canManage={canClearance} busy={busy} onChange={(fn) => refreshAfter(fn)} />
        )}

        {tab === 'kt' && (
          <div className="space-y-2 text-sm">
            {kt ? (
              <>
                <p><span className="text-muted-foreground">Status:</span> <ExitStatusBadge status={kt.status} /></p>
                {kt.responsibilities && <p><span className="font-medium">Responsibilities:</span> {kt.responsibilities}</p>}
                {kt.current_projects && <p><span className="font-medium">Current Projects:</span> {kt.current_projects}</p>}
                {kt.pending_tasks && <p><span className="font-medium">Pending Tasks:</span> {kt.pending_tasks}</p>}
                {kt.client_information && <p><span className="font-medium">Client Information:</span> {kt.client_information}</p>}
                {kt.system_access && <p><span className="font-medium">System Access:</span> {kt.system_access}</p>}
                {kt.status === 'submitted' && canApprove && (
                  <Button size="sm" disabled={busy} onClick={() => refreshAfter(() => exitApi.reviewKnowledgeTransfer(id, true))}>Approve Knowledge Transfer</Button>
                )}
              </>
            ) : <p className="text-muted-foreground">Not submitted yet.</p>}
          </div>
        )}

        {tab === 'assets' && (
          <AssetPanel assets={assets} canRecover={canRecoverAssets} busy={busy} onChange={(fn) => refreshAfter(fn)} />
        )}

        {tab === 'interview' && (
          <div className="space-y-2 text-sm">
            {interview ? (
              <>
                <p><span className="text-muted-foreground">Status:</span> <ExitStatusBadge status={interview.status} /></p>
                {interview.overall_rating && <p><span className="font-medium">Overall Rating:</span> {interview.overall_rating}/5</p>}
                {interview.reason_for_leaving && <p><span className="font-medium">Reason for Leaving:</span> {interview.reason_for_leaving}</p>}
                {interview.suggestions && <p><span className="font-medium">Suggestions:</span> {interview.suggestions}</p>}
                {interview.manager_feedback && <p><span className="font-medium">Manager Feedback:</span> {interview.manager_feedback}</p>}
                {interview.hr_feedback && <p><span className="font-medium">HR Feedback:</span> {interview.hr_feedback}</p>}
              </>
            ) : <p className="text-muted-foreground">Not started yet.</p>}
            {canApprove && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => refreshAfter(() => exitApi.skipInterview(id))}>Skip Interview</Button>
              </div>
            )}
          </div>
        )}

        {tab === 'settlement' && (
          <SettlementPanel
            id={id}
            settlement={settlement}
            canCalculate={canCalculate}
            canApprove={canApproveSettlement}
            canPay={canPay}
            busy={busy}
            onChange={(fn) => refreshAfter(fn)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChecklistPanel({ exitRequestId, items, canManage, busy, onChange }: { exitRequestId: string; items: ExitChecklistItem[]; canManage: boolean; busy: boolean; onChange: (fn: () => Promise<any>) => void }) {
  const [item, setItem] = useState('');
  const [department, setDepartment] = useState('');

  return (
    <div className="space-y-3">
      {canManage && (
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (!item || !department) return; onChange(async () => { await exitApi.createChecklistItem(exitRequestId, { item, department }); setItem(''); setDepartment(''); }); }}
        >
          <Input placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} />
          <Input placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          <Button type="submit" size="sm">Add</Button>
        </form>
      )}
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
            <div>
              <p className="text-sm font-medium">{c.item} {c.is_mandatory && <span className="text-red-500">*</span>}</p>
              <p className="text-xs text-muted-foreground">{c.department} {c.assigned_to_email ? `· ${c.assigned_to_email}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <ExitStatusBadge status={c.status} />
              {canManage && c.status === 'pending' && (
                <Button size="sm" onClick={() => onChange(() => exitApi.updateChecklistItem(c.id, { status: 'completed' }))}>Done</Button>
              )}
            </div>
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">No checklist items.</p>}
      </div>
    </div>
  );
}

function ClearancePanel({ items, canManage, busy, onChange }: { items: ExitClearance[]; canManage: boolean; busy: boolean; onChange: (fn: () => Promise<any>) => void }) {
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
          <div>
            <p className="text-sm font-medium">{c.department} {c.is_mandatory && <span className="text-red-500">*</span>}</p>
            {c.remarks && <p className="text-xs text-muted-foreground">{c.remarks}</p>}
          </div>
          <div className="flex items-center gap-2">
            <ExitStatusBadge status={c.status} />
            {canManage && c.status !== 'cleared' && (
              <Button size="sm" onClick={() => onChange(() => exitApi.updateClearance(c.id, { status: 'cleared', remarks: 'Cleared' }))}>Clear</Button>
            )}
          </div>
        </div>
      ))}
      {!items.length && <p className="text-sm text-muted-foreground">No clearances yet.</p>}
    </div>
  );
}

function AssetPanel({ assets, canRecover, busy, onChange }: { assets: AssetAssignment[]; canRecover: boolean; busy: boolean; onChange: (fn: () => Promise<any>) => void }) {
  return (
    <div className="space-y-2">
      {assets.map((a) => (
        <div key={a.id} className="flex items-center justify-between p-3 bg-muted/30 rounded">
          <div>
            <p className="text-sm font-medium">{a.asset_name} ({a.asset_code})</p>
            <p className="text-xs text-muted-foreground">{a.asset_type_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExitStatusBadge status={a.status} />
            {canRecover && a.status === 'recovery_pending' && (
              <>
                <Button size="sm" onClick={() => onChange(() => assetApi.recordReturn(a.id, { return_condition: 'good' }))}>Returned</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const amount = parseFloat(window.prompt('Recovery cost for damaged asset:', '0') || '0');
                  onChange(() => assetApi.recordReturn(a.id, { return_condition: 'damaged', recovery_amount: amount }));
                }}>Damaged</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const amount = parseFloat(window.prompt('Recovery cost for lost asset:', '0') || '0');
                  onChange(() => assetApi.recordReturn(a.id, { return_condition: 'lost', recovery_amount: amount }));
                }}>Lost</Button>
              </>
            )}
          </div>
        </div>
      ))}
      {!assets.length && <p className="text-sm text-muted-foreground">No assets assigned to this employee.</p>}
    </div>
  );
}

function SettlementPanel({ id, settlement, canCalculate, canApprove, canPay, busy, onChange }: {
  id: string; settlement: FinalSettlement | null; canCalculate: boolean; canApprove: boolean; canPay: boolean; busy: boolean;
  onChange: (fn: () => Promise<any>) => void;
}) {
  return (
    <div className="space-y-3">
      {canCalculate && (
        <Button size="sm" disabled={busy} onClick={() => onChange(() => exitApi.calculateSettlement(id))}>
          {settlement ? 'Recalculate Settlement' : 'Calculate Settlement'}
        </Button>
      )}
      {settlement ? (
        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
          <Row label="Basic Salary" value={settlement.basic_salary} />
          <Row label="Allowances" value={settlement.allowances} />
          <Row label="Gratuity" value={settlement.gratuity} />
          <Row label="Leave Encashment" value={settlement.leave_encashment} />
          <Row label="Bonus" value={settlement.bonus} />
          <Row label="Total Payable" value={settlement.total_payable} bold />
          <Row label="Notice Pay Recovery" value={settlement.notice_pay_recovery} negative />
          <Row label="Asset Recovery" value={settlement.asset_recovery} negative />
          <Row label="Deductions" value={settlement.deductions} negative />
          <Row label="Total Deductions" value={settlement.total_deductions} negative bold />
          <Row label="Net Payable" value={settlement.net_payable} bold className="col-span-2 text-lg" />
          <div className="col-span-2 flex items-center gap-2 pt-2">
            <span className="text-muted-foreground text-xs">Status:</span>
            <ExitStatusBadge status={settlement.payment_status} />
          </div>
          <div className="col-span-2 flex gap-2 pt-2">
            {canApprove && settlement.payment_status === 'pending_approval' && (
              <Button size="sm" disabled={busy} onClick={() => onChange(() => exitApi.approveSettlement(settlement.id, 'Approved by Finance/HR'))}>Approve Settlement</Button>
            )}
            {canPay && settlement.payment_status === 'approved' && (
              <Button size="sm" disabled={busy} onClick={() => onChange(() => exitApi.markSettlementPaid(settlement.id))}>Mark Paid</Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No settlement calculated yet. Complete checklist, clearances, and asset recovery first.</p>
      )}
    </div>
  );
}

function Row({ label, value, bold, negative, className }: { label: string; value: number; bold?: boolean; negative?: boolean; className?: string }) {
  return (
    <div className={className}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`${bold ? 'font-semibold' : ''} ${negative && value > 0 ? 'text-red-600' : ''}`}>
        {negative && value > 0 ? '-' : ''}₹{Number(value).toLocaleString('en-IN')}
      </p>
    </div>
  );
}
