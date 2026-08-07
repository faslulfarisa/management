'use client';

import { useState } from 'react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalLeave } from '@/components/employee/desktop/portal-leave';
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { LeaveBalanceCards } from '@/components/employee/leave/leave-balance-cards';
import { LeaveHistoryList } from '@/components/employee/leave/leave-history-list';
import { LeaveApplySheet } from '@/components/employee/leave/leave-apply-sheet';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function LeavePage() {
  return (
    <EmployeeGuard>
      <div className="md:hidden">
        <MobileLeaveContent />
      </div>

      <div className="hidden md:block">
        <PortalLeave />
      </div>
    </EmployeeGuard>
  );
}

function MobileLeaveContent() {
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-x-hidden">
      <MobileHeader title="My Leave" />

      <div className="space-y-5 px-4 pb-28 pt-4">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Leave Balance</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Available days by leave type</p>
            </div>
          </div>
          <LeaveBalanceCards />
        </section>

        <section>
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground">Requests</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Tap a card to view approval details</p>
          </div>
          <LeaveHistoryList />
        </section>
      </div>

      <Button
        type="button"
        onClick={() => setApplyOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-14 rounded-full px-5 shadow-lg"
      >
        <Plus className="mr-2 h-5 w-5" />
        Apply Leave
      </Button>

      <LeaveApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
