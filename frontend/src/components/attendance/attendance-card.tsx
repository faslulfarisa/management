'use client';

import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from './status-badge';
import { AttendanceTimeline } from './attendance-timeline';

interface AttendanceCardProps {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'present' | 'absent' | 'half_day' | 'late';
  lateMinutes?: number;
  overtimeMinutes?: number;
  onViewDetails?: (id: string) => void;
}

export function AttendanceCard({
  id,
  employeeCode,
  firstName,
  lastName,
  clockIn,
  clockOut,
  status,
  lateMinutes = 0,
  overtimeMinutes = 0,
  onViewDetails,
}: AttendanceCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewDetails?.(id)}>
      <CardContent className="p-5 space-y-4">
        {/* Header: Employee Info + Status */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="font-mono text-sm font-semibold text-slate-600">
                {employeeCode}
              </p>
            </div>
            <p className="font-semibold text-slate-900">
              {firstName} {lastName}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Timeline */}
        <AttendanceTimeline
          clockIn={clockIn}
          clockOut={clockOut}
          lateMinutes={lateMinutes}
          overtimeMinutes={overtimeMinutes}
        />
      </CardContent>
    </Card>
  );
}
