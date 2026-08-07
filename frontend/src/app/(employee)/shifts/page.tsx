'use client';

import { useState } from 'react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalShifts } from '@/components/employee/desktop/portal-shifts';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { ShiftWeekView } from '@/components/employee/shifts/shift-week-view';
import { UpcomingShiftsList } from '@/components/employee/shifts/upcoming-shifts-list';
import { ShiftOverrideSheet } from '@/components/employee/requests/shift-override-sheet';
import { Plus } from 'lucide-react';

export default function ShiftsPage() {
  const [overrideOpen, setOverrideOpen] = useState(false);

  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileShiftsContent onRequestOverride={() => setOverrideOpen(true)} />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalShifts onRequestOverride={() => setOverrideOpen(true)} />
      </div>

      <ShiftOverrideSheet open={overrideOpen} onClose={() => setOverrideOpen(false)} />
    </EmployeeGuard>
  );
}

function MobileShiftsContent({ onRequestOverride }: { onRequestOverride: () => void }) {
  return (
    <div className="flex flex-col">
      <MobileHeader 
        title="My Schedule" 
        rightAction={
          <button 
            onClick={onRequestOverride}
            className="flex h-8 items-center gap-1 px-2.5 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Override
          </button>
        }
      />

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
