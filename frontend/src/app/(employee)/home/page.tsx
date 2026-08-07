'use client';

import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalDashboard } from '@/components/employee/desktop/portal-dashboard';
// ── Mobile imports (original) ──────────────────────────────────
import { useAuthStore } from '@/store/auth.store';
import { PunchCard } from '@/components/employee/home/punch-card';
import { ShiftSummaryCard } from '@/components/employee/home/shift-summary-card';
import { LeaveBalanceStrip } from '@/components/employee/home/leave-balance-strip';
import { Bell } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden flex flex-col">
        <MobileHomeContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalDashboard />
      </div>
    </EmployeeGuard>
  );
}

function MobileHomeContent() {
  const { employeeProfile } = useAuthStore();
  const firstName = employeeProfile?.first_name ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{greeting}</p>
          <h1 className="text-xl font-bold text-foreground">{firstName}</h1>
        </div>
        <Link
          href="/notifications"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5 text-foreground" />
        </Link>
      </div>
      <div className="px-4 space-y-4 pb-6">
        <PunchCard />
        <ShiftSummaryCard />
        <LeaveBalanceStrip />
      </div>
    </div>
  );
}
