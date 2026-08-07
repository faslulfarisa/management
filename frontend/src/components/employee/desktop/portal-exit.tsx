'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Plus, Download } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { ExitTimelineView } from '@/components/exit-management/exit-timeline-view';
import { ExitStatusBadge } from '@/components/exit-management/exit-status-badge';
import { ExitSubmitSheet } from '@/components/employee/exit/exit-submit-sheet';
import { EXIT_REQUEST_TYPE_LABELS } from '@/types/exit';
import { generateRelievingLetterPdf } from '@/lib/generate-relieving-letter-pdf';
import { generateFnfStatementPdf } from '@/lib/generate-fnf-statement-pdf';

export function PortalExit() {
  const queryClient = useQueryClient();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [ktForm, setKtForm] = useState({ responsibilities: '', current_projects: '', pending_tasks: '', client_information: '', system_access: '' });
  const [interviewForm, setInterviewForm] = useState<{ overall_rating: number; reason_for_leaving: string; suggestions: string; would_recommend: boolean }>({
    overall_rating: 3, reason_for_leaving: '', suggestions: '', would_recommend: true,
  });

  const { data: exitRequest, isLoading } = useQuery({
    queryKey: ['my-exit-request'],
    queryFn: () => employeeApi.getMyExitRequest(),
    staleTime: 60_000,
  });

  const exitId = exitRequest?.id;

  const { data: timeline = [] } = useQuery({
    queryKey: ['my-exit-timeline', exitId],
    queryFn: () => employeeApi.getExitTimeline(exitId!),
    enabled: !!exitId,
  });
  const { data: checklist = [] } = useQuery({
    queryKey: ['my-exit-checklist', exitId],
    queryFn: () => employeeApi.getMyExitChecklist(exitId!),
    enabled: !!exitId,
  });
  const { data: clearances = [] } = useQuery({
    queryKey: ['my-exit-clearances', exitId],
    queryFn: () => employeeApi.getMyExitClearances(exitId!),
    enabled: !!exitId,
  });
  const { data: kt } = useQuery({
    queryKey: ['my-exit-kt', exitId],
    queryFn: () => employeeApi.getMyKnowledgeTransfer(exitId!),
    enabled: !!exitId,
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['my-exit-assets', exitId],
    queryFn: () => employeeApi.getMyExitAssets(exitId!),
    enabled: !!exitId,
  });
  const { data: settlement } = useQuery({
    queryKey: ['my-exit-settlement', exitId],
    queryFn: () => employeeApi.getMySettlement(exitId!),
    enabled: !!exitId,
  });
  const { data: documents = [] } = useQuery({
    queryKey: ['my-exit-documents', exitId],
    queryFn: () => employeeApi.getMyExitDocuments(exitId!),
    enabled: !!exitId,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-exit-request'] });

  const reportError = (err: any, fallback: string) => {
    alert(err?.response?.data?.message || err?.response?.data?.error || fallback);
  };

  const withdraw = async () => {
    if (!exitId) return;
    const reason = window.prompt('Reason for withdrawing your resignation:');
    if (!reason) return;
    try {
      await employeeApi.withdrawExitRequest(exitId, reason);
      refresh();
    } catch (err: any) {
      reportError(err, 'Failed to withdraw exit request');
    }
  };

  const submitKt = async (finalize: boolean) => {
    if (!exitId) return;
    try {
      await employeeApi.submitKnowledgeTransfer(exitId, { ...ktForm, finalize });
      queryClient.invalidateQueries({ queryKey: ['my-exit-kt', exitId] });
    } catch (err: any) {
      reportError(err, 'Failed to submit knowledge transfer');
    }
  };

  const submitInterview = async () => {
    if (!exitId) return;
    try {
      await employeeApi.submitExitInterview(exitId, {
        overall_rating: interviewForm.overall_rating,
        reason_for_leaving: interviewForm.reason_for_leaving,
        suggestions: interviewForm.suggestions,
        would_recommend: interviewForm.would_recommend,
        responses: {},
      });
      queryClient.invalidateQueries({ queryKey: ['my-exit-request'] });
    } catch (err: any) {
      reportError(err, 'Failed to submit exit interview');
    }
  };

  const noticeDaysRemaining = exitRequest?.last_working_date
    ? Math.max(Math.ceil((new Date(exitRequest.last_working_date).getTime() - Date.now()) / 86400000), 0)
    : null;

  return (
    <div>
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Exit</h1>
        {!exitRequest && !isLoading && (
          <Button size="sm" onClick={() => setSubmitOpen(true)} className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Submit Resignation
          </Button>
        )}
        {exitRequest?.status === 'pending_approval' && (
          <Button size="sm" variant="outline" onClick={withdraw} className="h-8 text-xs">Withdraw Request</Button>
        )}
      </div>

      <div className="p-6 space-y-5 max-w-[1100px]">
        {isLoading ? (
          <div className="h-40 rounded-xl bg-white border border-gray-200 animate-pulse" />
        ) : !exitRequest ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LogOut className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">You don't have an active exit request.</p>
            <p className="text-xs text-gray-400 mt-1">If you wish to resign, retire, or otherwise initiate a separation, submit a request above.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[11px] text-gray-400">Status</p>
                <ExitStatusBadge status={exitRequest.status} className="mt-1" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Type</p>
                <p className="text-sm font-medium text-gray-900">{EXIT_REQUEST_TYPE_LABELS[exitRequest.request_type] ?? exitRequest.request_type}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Last Working Day</p>
                <p className="text-sm font-medium text-gray-900">{new Date(exitRequest.last_working_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Notice Countdown</p>
                <p className="text-sm font-medium text-gray-900">{noticeDaysRemaining !== null ? `${noticeDaysRemaining} day(s) remaining` : '—'}</p>
              </div>
            </div>

            <Section title="Timeline">
              <ExitTimelineView events={timeline} />
            </Section>

            <Section title="Exit Checklist Progress">
              {checklist.length ? (
                <div className="space-y-2">
                  {checklist.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                      <span>{c.item} <span className="text-gray-400">· {c.department}</span></span>
                      <ExitStatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              ) : <Empty text="Checklist will appear once your request is approved." />}
            </Section>

            <Section title="Department Clearances">
              {clearances.length ? (
                <div className="space-y-2">
                  {clearances.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                      <span>{c.department}</span>
                      <ExitStatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              ) : <Empty text="Clearances will appear once your request is approved." />}
            </Section>

            <Section title="Knowledge Transfer">
              {kt?.status === 'submitted' || kt?.status === 'approved' ? (
                <div className="text-sm space-y-1">
                  <p><ExitStatusBadge status={kt.status} /></p>
                  <p className="text-gray-600">{kt.responsibilities}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea className="w-full border rounded-md p-2 text-sm" placeholder="Key responsibilities" value={ktForm.responsibilities} onChange={(e) => setKtForm({ ...ktForm, responsibilities: e.target.value })} />
                  <textarea className="w-full border rounded-md p-2 text-sm" placeholder="Current projects" value={ktForm.current_projects} onChange={(e) => setKtForm({ ...ktForm, current_projects: e.target.value })} />
                  <textarea className="w-full border rounded-md p-2 text-sm" placeholder="Pending tasks" value={ktForm.pending_tasks} onChange={(e) => setKtForm({ ...ktForm, pending_tasks: e.target.value })} />
                  <textarea className="w-full border rounded-md p-2 text-sm" placeholder="Client information (no credentials)" value={ktForm.client_information} onChange={(e) => setKtForm({ ...ktForm, client_information: e.target.value })} />
                  <textarea className="w-full border rounded-md p-2 text-sm" placeholder="System access to hand over (no passwords)" value={ktForm.system_access} onChange={(e) => setKtForm({ ...ktForm, system_access: e.target.value })} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => submitKt(false)}>Save Draft</Button>
                    <Button size="sm" onClick={() => submitKt(true)}>Submit Final</Button>
                  </div>
                </div>
              )}
            </Section>

            <Section title="Asset Return Status">
              {assets.length ? (
                <div className="space-y-2">
                  {assets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                      <span>{a.asset_name} <span className="text-gray-400">· {a.asset_type_name}</span></span>
                      <ExitStatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              ) : <Empty text="No assets assigned." />}
            </Section>

            <Section title="Exit Interview">
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Overall rating (1–5)</label>
                <input type="range" min={1} max={5} value={interviewForm.overall_rating} onChange={(e) => setInterviewForm({ ...interviewForm, overall_rating: parseInt(e.target.value, 10) })} className="w-full" />
                <textarea className="w-full border rounded-md p-2 text-sm" placeholder="Reason for leaving" value={interviewForm.reason_for_leaving} onChange={(e) => setInterviewForm({ ...interviewForm, reason_for_leaving: e.target.value })} />
                <textarea className="w-full border rounded-md p-2 text-sm" placeholder="What could we have done better?" value={interviewForm.suggestions} onChange={(e) => setInterviewForm({ ...interviewForm, suggestions: e.target.value })} />
                <Button size="sm" onClick={submitInterview}>Submit Interview</Button>
              </div>
            </Section>

            {settlement && (
              <Section title="Full & Final Settlement Summary">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p>Gross Payable: <strong>₹{Number(settlement.total_payable).toLocaleString('en-IN')}</strong></p>
                  <p>Total Deductions: <strong>₹{Number(settlement.total_deductions).toLocaleString('en-IN')}</strong></p>
                  <p className="col-span-2 text-base">Net Payable: <strong>₹{Number(settlement.net_payable).toLocaleString('en-IN')}</strong></p>
                  <p className="col-span-2"><ExitStatusBadge status={settlement.payment_status} /></p>
                </div>
                <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => generateFnfStatementPdf(settlement, exitRequest)}>
                  <Download className="h-3.5 w-3.5" /> Download FnF Statement
                </Button>
              </Section>
            )}

            <Section title="Documents">
              {exitRequest.status === 'completed' && (
                <Button size="sm" variant="outline" className="mb-2 gap-1.5" onClick={() => generateRelievingLetterPdf(exitRequest)}>
                  <Download className="h-3.5 w-3.5" /> Download Relieving Letter
                </Button>
              )}
              {documents.length ? (
                <div className="space-y-1">
                  {documents.map((d: any) => (
                    <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline block">{d.name}</a>
                  ))}
                </div>
              ) : <Empty text="No documents generated yet." />}
            </Section>
          </>
        )}
      </div>

      <ExitSubmitSheet open={submitOpen} onClose={() => setSubmitOpen(false)} onSubmitted={refresh} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-900 mb-3">{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400">{text}</p>;
}
