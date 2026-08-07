'use client';

import { LogIn, LogOut, Coffee, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BreakSession, EmployeeTodayAttendance } from '@/types/employee';

interface TimelineEvent {
  time: string;
  label: string;
  icon: typeof LogIn;
  tone: 'in' | 'out' | 'break-start' | 'break-end';
  detail?: string;
}

interface AttendanceTimelineProps {
  today: EmployeeTodayAttendance;
  breaks: BreakSession[];
}

const TONE_STYLES: Record<TimelineEvent['tone'], string> = {
  in: 'bg-emerald-100 text-emerald-700',
  out: 'bg-slate-200 text-slate-700',
  'break-start': 'bg-amber-100 text-amber-700',
  'break-end': 'bg-blue-100 text-blue-700',
};

export function AttendanceTimeline({ today, breaks }: AttendanceTimelineProps) {
  const events: TimelineEvent[] = [];

  if (today.clock_in) {
    events.push({ time: today.clock_in, label: 'Punch In', icon: LogIn, tone: 'in' });
  }

  for (const b of breaks) {
    events.push({
      time: b.started_at,
      label: b.reason_label,
      icon: Coffee,
      tone: 'break-start',
      detail: b.note ?? undefined,
    });
    if (b.ended_at) {
      events.push({
        time: b.ended_at,
        label: `Back from ${b.reason_label}`,
        icon: RotateCcw,
        tone: 'break-end',
        detail: b.duration_minutes != null
          ? `${b.duration_minutes}m${b.is_overdue ? ` · ${b.overdue_minutes}m over` : ''}`
          : undefined,
      });
    }
  }

  if (today.clock_out) {
    events.push({ time: today.clock_out, label: 'Final Punch Out', icon: LogOut, tone: 'out' });
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (!events.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Today's Timeline
      </p>
      <ol className="space-y-3">
        {events.map((event, idx) => {
          const Icon = event.icon;
          return (
            <li key={`${event.time}-${idx}`} className="flex items-start gap-3">
              <div className={cn('flex h-8 w-8 flex-none items-center justify-center rounded-full', TONE_STYLES[event.tone])}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{event.label}</span>
                  <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                    {format(parseISO(event.time), 'hh:mm a')}
                  </span>
                </div>
                {event.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
