'use client';

import { useState } from 'react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalRequests } from '@/components/employee/desktop/portal-requests';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { RequestTypeSelector, RequestType } from '@/components/employee/requests/request-type-selector';
import { RequestList } from '@/components/employee/requests/request-list';
import { LeaveApplySheet } from '@/components/employee/leave/leave-apply-sheet';
import { CorrectionRequestSheet } from '@/components/employee/attendance/correction-request-sheet';
import { ShiftChangeSheet } from '@/components/employee/requests/shift-change-sheet';
import { OvertimeSheet } from '@/components/employee/requests/overtime-sheet';
import { ExpenseSheet } from '@/components/employee/requests/expense-sheet';
import { FineAppealSheet } from '@/components/employee/requests/fine-appeal-sheet';

export default function RequestsPage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileRequestsContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalRequests />
      </div>
    </EmployeeGuard>
  );
}

function MobileRequestsContent() {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [shiftChangeOpen, setShiftChangeOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [fineAppealOpen, setFineAppealOpen] = useState(false);

  const handleTypeSelect = (type: RequestType) => {
    switch (type) {
      case 'leave':        setLeaveOpen(true);        break;
      case 'correction':   setCorrectionOpen(true);   break;
      case 'shift_change': setShiftChangeOpen(true);  break;
      case 'overtime':     setOvertimeOpen(true);      break;
      case 'expense':      setExpenseOpen(true);       break;
      case 'fine_appeal':  setFineAppealOpen(true);    break;
    }
  };

  return (
    <div className="flex flex-col">
      <MobileHeader title="Requests" />

      <div className="px-4 pt-4 pb-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">New Request</p>
          <RequestTypeSelector onSelect={handleTypeSelect} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">My Requests</p>
          <RequestList />
        </div>
      </div>

      <LeaveApplySheet open={leaveOpen} onClose={() => setLeaveOpen(false)} />
      <CorrectionRequestSheet open={correctionOpen} onClose={() => setCorrectionOpen(false)} />
      <ShiftChangeSheet open={shiftChangeOpen} onClose={() => setShiftChangeOpen(false)} />
      <OvertimeSheet open={overtimeOpen} onClose={() => setOvertimeOpen(false)} />
      <ExpenseSheet open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <FineAppealSheet open={fineAppealOpen} onClose={() => setFineAppealOpen(false)} />
    </div>
  );
}
