'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { employeeApi } from '@/lib/employee-api';
import { cn } from '@/lib/utils';
import { PunchOutReasonModal } from './punch-out-reason-modal';
import { ActiveBreakBanner } from './active-break-banner';
import { AttendanceTimeline } from './attendance-timeline';
import { BreakSummary } from './break-summary';

export function PunchCard() {
  const queryClient = useQueryClient();
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);

  const { data: today, isLoading } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: breaksData } = useQuery({
    queryKey: ['employee-today-breaks'],
    queryFn: () => employeeApi.getTodayBreaks(),
    staleTime: 30_000,
  });

  const isPunchedIn = today?.is_punched_in ?? false;
  const punch = useMutation({
    mutationFn: ({ type, reason_code, note }: { type: 'in' | 'out'; reason_code?: string; note?: string }) =>
      employeeApi.punch(type, { reason_code, note }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(['employee-today-attendance'], data);
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-history'] });
      queryClient.invalidateQueries({ queryKey: ['employee-today-breaks'] });
      setReasonModalOpen(false);
      setFlashSuccess(true);

      if (variables.type === 'in' && data.late_minutes > 0 && !isPunchedIn) {
        setLateWarning(`Late Punch In: You have punched in after the allowed grace period. Your attendance has been marked as Late.`);
      }

      setTimeout(() => setFlashSuccess(false), 2000);

      const isTypeIn = !today?.is_punched_in && !today?.clock_in;
      // We can also check data.late_minutes here directly. Wait, the type arg isn't in scope unless we get it from variables.
      if (data.late_minutes > 0 && !today?.clock_in) {
        setWarning(`Warning: You have punched in late by ${data.late_minutes} minutes past the grace period.`);
        setTimeout(() => setWarning(null), 5000);
      }
    },
  });

  const isOnBreak = today?.is_on_break ?? false;
  const canPunchOut = isPunchedIn && !today?.clock_out && !isOnBreak;
  const canPunchIn = !isPunchedIn && !today?.clock_in && !isOnBreak;

  const fmt = (t: string | null | undefined) =>
    t ? format(parseISO(t), 'hh:mm a') : null;

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
        <div className="h-5 w-1/3 rounded bg-muted mb-4" />
        <div className="h-14 w-full rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Attendance</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {format(new Date(), 'EEEE, d MMM')}
          </p>
        </div>
        {today?.status && (
          <StatusChip status={today.status} />
        )}
      </div>

      {/* Clock in/out times */}
      {(today?.clock_in || today?.clock_out) && (
        <div className="flex gap-4 mb-4">
          {today.clock_in && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">In</span>
              <span className="text-xs font-semibold text-foreground">{fmt(today.clock_in)}</span>
            </div>
          )}
          {today.clock_out && (
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-xs text-muted-foreground">Out</span>
              <span className="text-xs font-semibold text-foreground">{fmt(today.clock_out)}</span>
            </div>
          )}
          {today.late_minutes > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs text-orange-600 font-medium">{today.late_minutes}m late</span>
            </div>
          )}
        </div>
      )}

      {/* Active break banner */}
      {isOnBreak && today?.current_break && (
        <ActiveBreakBanner
          currentBreak={today.current_break}
          onReturn={() => punch.mutate({ type: 'in' })}
          isSubmitting={punch.isPending}
        />
      )}

      {/* Punch button */}
      {(canPunchIn || canPunchOut) && (
        <button
          onClick={() => (canPunchIn ? punch.mutate({ type: 'in' }) : setReasonModalOpen(true))}
          disabled={punch.isPending}
          className={cn(
            'w-full flex items-center justify-center gap-2 h-14 rounded-xl font-semibold text-base transition-all active:scale-95',
            canPunchIn
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            punch.isPending && 'opacity-70 cursor-not-allowed',
          )}
        >
          {punch.isPending ? (
            <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : flashSuccess ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              <span>Done!</span>
            </>
          ) : canPunchIn ? (
            <>
              <LogIn className="h-5 w-5" />
              <span>Punch In</span>
            </>
          ) : (
            <>
              <LogOut className="h-5 w-5" />
              <span>Punch Out</span>
            </>
          )}
        </button>
      )}

      {/* Already punched out */}
      {today?.clock_in && today?.clock_out && (
        <div className="flex items-center justify-center gap-2 h-10 text-emerald-600 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          <span>Attendance recorded</span>
        </div>
      )}

      {/* Shift info */}
      {today?.shift_name && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {today.shift_name}
            {today.shift_start && today.shift_end &&
              ` · ${fmt(today.shift_start)} – ${fmt(today.shift_end)}`
            }
          </span>
        </div>
      )}

      <PunchOutReasonModal
        open={reasonModalOpen}
        onOpenChange={setReasonModalOpen}
        onConfirm={(reason_code, note) => punch.mutate({ type: 'out', reason_code, note })}
        isSubmitting={punch.isPending}
        breakTypes={breaksData?.policy?.break_types}
      />

      {today && breaksData && (
        <div className="mt-4 space-y-4">
          <AttendanceTimeline today={today} breaks={breaksData.breaks} />
          <BreakSummary breaks={breaksData.breaks} limits={breaksData.limits} />
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    present: { label: 'Present', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    late: { label: 'Late', className: 'bg-orange-50  text-orange-700  border-orange-200' },
    half_day: { label: 'Half Day', className: 'bg-amber-50   text-amber-700   border-amber-200' },
    absent: { label: 'Absent', className: 'bg-red-50     text-red-700     border-red-200' },
  };
  const cfg = map[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', cfg.className)}>
      {cfg.label}
    </span>
  );
}
