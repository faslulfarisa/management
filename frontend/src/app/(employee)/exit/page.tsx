'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, LogOut } from 'lucide-react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalExit } from '@/components/employee/desktop/portal-exit';
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { ExitSubmitSheet } from '@/components/employee/exit/exit-submit-sheet';
import { ExitTimelineView } from '@/components/exit-management/exit-timeline-view';
import { ExitStatusBadge } from '@/components/exit-management/exit-status-badge';
import { Button } from '@/components/ui/button';
import { employeeApi } from '@/lib/employee-api';

export default function ExitPage() {
  return (
    <EmployeeGuard>
      <div className="md:hidden">
        <MobileExitContent />
      </div>
      <div className="hidden md:block">
        <PortalExit />
      </div>
    </EmployeeGuard>
  );
}

function MobileExitContent() {
  const queryClient = useQueryClient();
  const [submitOpen, setSubmitOpen] = useState(false);

  const { data: exitRequest, isLoading } = useQuery({
    queryKey: ['my-exit-request'],
    queryFn: () => employeeApi.getMyExitRequest(),
    staleTime: 60_000,
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['my-exit-timeline', exitRequest?.id],
    queryFn: () => employeeApi.getExitTimeline(exitRequest!.id),
    enabled: !!exitRequest,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-exit-request'] });

  return (
    <div className="flex flex-col">
      <MobileHeader
        title="My Exit"
        rightAction={
          !exitRequest && !isLoading ? (
            <Button size="sm" onClick={() => setSubmitOpen(true)} className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Submit
            </Button>
          ) : undefined
        }
      />
      <div className="px-4 pt-4 space-y-5 pb-6">
        {isLoading ? (
          <div className="h-32 rounded-xl bg-muted animate-pulse" />
        ) : !exitRequest ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LogOut className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">You don't have an active exit request.</p>
          </div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{exitRequest.request_type.replace(/_/g, ' ')}</p>
                <ExitStatusBadge status={exitRequest.status} />
              </div>
              <p className="text-xs text-muted-foreground">Last working day: {new Date(exitRequest.last_working_date).toLocaleDateString()}</p>
              {exitRequest.status === 'pending_approval' && (
                <Button
                  size="sm" variant="outline" className="w-full mt-2"
                  onClick={async () => {
                    const reason = window.prompt('Reason for withdrawing:');
                    if (!reason) return;
                    try {
                      await employeeApi.withdrawExitRequest(exitRequest.id, reason);
                      refresh();
                    } catch (err: any) {
                      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to withdraw exit request');
                    }
                  }}
                >
                  Withdraw Request
                </Button>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-3">Timeline</p>
              <ExitTimelineView events={timeline} />
            </div>
          </>
        )}
      </div>
      <ExitSubmitSheet open={submitOpen} onClose={() => setSubmitOpen(false)} onSubmitted={refresh} />
    </div>
  );
}
