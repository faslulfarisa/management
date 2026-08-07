'use client';

import { AttendanceCard } from './attendance-card';

interface DailyRecord {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'present' | 'absent' | 'half_day' | 'late';
  late_minutes?: number;
  overtime_minutes?: number;
}

interface DailyAttendanceGridProps {
  records: DailyRecord[];
  onViewDetails?: (id: string) => void;
  isLoading?: boolean;
}

export function DailyAttendanceGrid({
  records,
  onViewDetails,
  isLoading,
}: DailyAttendanceGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-slate-500">Loading attendance records...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 border border-dashed border-slate-200 rounded-lg bg-slate-50">
        <p className="text-slate-500 font-medium">No attendance records found for this date</p>
        <p className="text-slate-400 text-sm mt-1">Employees haven't clocked in yet or no records exist</p>
      </div>
    );
  }

  // Filter out records with missing employee data
  const validRecords = records.filter(r => r.first_name && r.last_name && r.employee_code);
  const invalidCount = records.length - validRecords.length;

  if (validRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 border border-dashed border-slate-200 rounded-lg bg-slate-50">
        <p className="text-slate-500 font-medium">No employee data available</p>
        <p className="text-slate-400 text-sm mt-1">Attendance records found but missing employee information</p>
        <p className="text-slate-400 text-xs mt-2">({records.length} record(s) without employee data)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {invalidCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">
            ⚠️ {invalidCount} attendance record(s) could not be displayed due to missing employee data
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {validRecords.map((record) => (
          <AttendanceCard
            key={record.id}
            id={record.id}
            employeeCode={record.employee_code}
            firstName={record.first_name}
            lastName={record.last_name}
            date={record.date}
            clockIn={record.clock_in}
            clockOut={record.clock_out}
            status={record.status}
            lateMinutes={record.late_minutes}
            overtimeMinutes={record.overtime_minutes}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>
    </div>
  );
}
