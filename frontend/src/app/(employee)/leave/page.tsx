'use client';

import { useState } from 'react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalLeave } from '@/components/employee/desktop/portal-leave';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { LeaveBalanceCards } from '@/components/employee/leave/leave-balance-cards';
import { LeaveHistoryList } from '@/components/employee/leave/leave-history-list';
import { LeaveApplySheet } from '@/components/employee/leave/leave-apply-sheet';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function LeavePage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileLeaveContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalLeave />
      </div>
    </EmployeeGuard>
  );
}

function MobileLeaveContent() {
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <MobileHeader
        title="My Leave"
        rightAction={
          <Button size="sm" onClick={() => setApplyOpen(true)} className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Apply
          </Button>
        }
      />
      <div className="px-4 pt-4 space-y-5 pb-6">
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Leave Balance</p>
          <LeaveBalanceCards />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Request History</p>
          <LeaveHistoryList />
        </div>
      </div>
      <LeaveApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
