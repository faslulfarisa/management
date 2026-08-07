'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfWeek, addDays } from 'date-fns';
import { Check, X, Clock, Moon } from 'lucide-react';

interface WeeklyRecord {
  date: string;
  status: 'present' | 'absent' | 'late' | 'half_day';
  clockIn?: string | null;
  clockOut?: string | null;
}

interface WeeklySummaryProps {
  employeeName: string;
  employeeCode: string;
  weekStartDate: Date;
  records: WeeklyRecord[];
}

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const statusIcons = {
  present: { Icon: Check, bg: 'bg-emerald-100', text: 'text-emerald-700' },
  absent: { Icon: X, bg: 'bg-red-100', text: 'text-red-700' },
  late: { Icon: Clock, bg: 'bg-orange-100', text: 'text-orange-700' },
  half_day: { Icon: Moon, bg: 'bg-blue-100', text: 'text-blue-700' },
};

export function WeeklySummary({
  employeeName,
  employeeCode,
  weekStartDate,
  records,
}: WeeklySummaryProps) {
  const daysOfWeek = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek(weekStartDate), i)
  );

  const recordsByDate = records.reduce(
    (acc, record) => {
      acc[record.date] = record;
      return acc;
    },
    {} as Record<string, WeeklyRecord>
  );

  const presentCount = records.filter((r) => r.status === 'present').length;
  const lateCount = records.filter((r) => r.status === 'late').length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const halfDayCount = records.filter((r) => r.status === 'half_day').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {employeeName} ({employeeCode})
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Week of {format(weekStartDate, 'MMM d, yyyy')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Daily Grid */}
        <div className="grid grid-cols-7 gap-2">
          {dayLabels.map((label, idx) => {
            const date = daysOfWeek[idx];
            const dateStr = format(date, 'yyyy-MM-dd');
            const record = recordsByDate[dateStr];
            const config = record ? statusIcons[record.status] : null;
            const Icon = config?.Icon;

            return (
              <div key={idx} className="text-center">
                <p className="text-xs font-semibold text-slate-600 mb-1">
                  {label}
                </p>
                <div className="text-xs text-slate-500 mb-1">
                  {format(date, 'd')}
                </div>
                {record && Icon ? (
                  <div
                    className={`w-full aspect-square flex items-center justify-center rounded-lg ${config?.bg}`}
                  >
                    <Icon className={`w-4 h-4 ${config?.text}`} />
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-slate-50 rounded-lg border border-dashed border-slate-200" />
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly Stats */}
        <div className="border-t pt-4 grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-xs text-slate-600">Present</p>
            <p className="text-lg font-bold text-emerald-600">{presentCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Late</p>
            <p className="text-lg font-bold text-orange-600">{lateCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Half Day</p>
            <p className="text-lg font-bold text-blue-600">{halfDayCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Absent</p>
            <p className="text-lg font-bold text-red-600">{absentCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
