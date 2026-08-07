'use client';

import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalShifts } from '@/components/employee/desktop/portal-shifts';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { ShiftWeekView } from '@/components/employee/shifts/shift-week-view';
import { UpcomingShiftsList } from '@/components/employee/shifts/upcoming-shifts-list';

export default function ShiftsPage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileShiftsContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalShifts />
      </div>
    </EmployeeGuard>
  );
}

function MobileShiftsContent() {
  return (
    <div className="flex flex-col">
      <MobileHeader title="My Schedule" />

      <div className="px-4 pt-4 pb-6 space-y-5">
        <ShiftWeekView />
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Upcoming (Next 14 days)</p>
          <UpcomingShiftsList />
        </div>
      </div>
    </div>
  );
}
