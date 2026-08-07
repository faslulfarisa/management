'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalAttendance } from '@/components/employee/desktop/portal-attendance';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { AttendanceCalendar } from '@/components/employee/attendance/attendance-calendar';
import { AttendanceHistoryList } from '@/components/employee/attendance/attendance-history-list';
import { CorrectionRequestSheet } from '@/components/employee/attendance/correction-request-sheet';
import { AttendanceTimeline } from '@/components/employee/home/attendance-timeline';
import { BreakSummary } from '@/components/employee/home/break-summary';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { FilePen } from 'lucide-react';

export default function AttendancePage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileAttendanceContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalAttendance />
      </div>
    </EmployeeGuard>
  );
}

function MobileAttendanceContent() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();

  const { data: today } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: breaksData } = useQuery({
    queryKey: ['employee-today-breaks'],
    queryFn: () => employeeApi.getTodayBreaks(),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col">
      <MobileHeader
        title="My Attendance"
        rightAction={
          <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)} className="h-8 gap-1.5 text-xs">
            <FilePen className="h-3.5 w-3.5" />
            Correct
          </Button>
        }
      />
      <div className="px-4 pt-4 space-y-4 pb-6">
        {today && breaksData && (
          <>
            <AttendanceTimeline today={today} breaks={breaksData.breaks} />
            <BreakSummary breaks={breaksData.breaks} limits={breaksData.limits} />
          </>
        )}
        <AttendanceCalendar onDayPress={(date) => { setSelectedDate(date); setSheetOpen(true); }} />
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Recent Records</p>
          <AttendanceHistoryList />
        </div>
      </div>
      <CorrectionRequestSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedDate(undefined); }}
        prefillDate={selectedDate}
      />
    </div>
  );
}
