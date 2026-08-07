'use client';

import { format, parse, differenceInHours, differenceInMinutes } from 'date-fns';

interface AttendanceTimelineProps {
  clockIn: string | null;
  clockOut: string | null;
  lateMinutes?: number;
  overtimeMinutes?: number;
}

export function AttendanceTimeline({
  clockIn,
  clockOut,
  lateMinutes = 0,
  overtimeMinutes = 0,
}: AttendanceTimelineProps) {
  if (!clockIn) {
    return (
      <div className="flex items-center justify-center h-20 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-500">No attendance recorded</p>
      </div>
    );
  }

  const inTime = new Date(clockIn);
  const outTime = clockOut ? new Date(clockOut) : null;

  const hours = outTime ? differenceInHours(outTime, inTime) : 0;
  const minutes = outTime ? differenceInMinutes(outTime, inTime) % 60 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-4">
        {/* Clock In */}
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-600 mb-1">Clock In</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-emerald-600">
              {format(inTime, 'HH:mm')}
            </p>
            {lateMinutes > 0 && (
              <span className="text-xs font-medium text-orange-600">
                {lateMinutes}m late
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">{format(inTime, 'EEE, MMM d')}</p>
        </div>

        {/* Duration */}
        {outTime && (
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-600 mb-1">Duration</p>
            <p className="text-2xl font-bold text-blue-600">
              {hours}h {minutes}m
            </p>
            <p className="text-xs text-slate-500">Worked</p>
          </div>
        )}

        {/* Clock Out */}
        {outTime && (
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-600 mb-1">Clock Out</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-800">
                {format(outTime, 'HH:mm')}
              </p>
              {overtimeMinutes && overtimeMinutes > 0 && (
                <span className="text-xs font-medium text-purple-600">
                  {overtimeMinutes}m OT
                </span>
              )}
            </div>
              <p className="text-xs text-slate-500">{format(outTime, 'EEE, MMM d')}</p>
          </div>
        )}
      </div>

      {/* Visual Timeline Bar */}
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mt-4">
        {/* In time marker */}
        <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500 rounded-full" />
        {/* Out time marker */}
        {outTime && (
          <div className="absolute right-0 top-0 h-full w-1 bg-slate-500 rounded-full" />
        )}
        {/* Duration fill */}
        {outTime && (
          <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400 to-blue-400 rounded-full" style={{
            width: '100%',
            opacity: 0.6,
          }} />
        )}
      </div>
    </div>
  );
}
