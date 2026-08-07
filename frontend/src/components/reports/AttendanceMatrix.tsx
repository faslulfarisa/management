'use client';

import { getDaysInMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const STATUS_STYLE: Record<string, string> = {
  present:  'bg-green-100 text-green-800',
  late:     'bg-amber-100 text-amber-800',
  absent:   'bg-red-100 text-red-800',
  half_day: 'bg-orange-100 text-orange-700',
  on_leave: 'bg-blue-100 text-blue-700',
  weekend:  'bg-gray-50 text-gray-400',
  holiday:  'bg-gray-50 text-gray-500',
};

const STATUS_ABBR: Record<string, string> = {
  present:  'P',
  late:     'L',
  absent:   'A',
  half_day: 'H',
  on_leave: 'OL',
  weekend:  '—',
  holiday:  'H*',
};

const LEGEND = [
  { key: 'present',  label: 'Present'   },
  { key: 'late',     label: 'Late'      },
  { key: 'absent',   label: 'Absent'    },
  { key: 'half_day', label: 'Half Day'  },
  { key: 'on_leave', label: 'On Leave'  },
];

export interface MatrixRow {
  employee_code: string;
  employee_name: string;
  days: Record<string, { status: string; in?: string; out?: string }>;
}

export interface AttendanceMatrixProps {
  month: string; // 'YYYY-MM'
  rows: MatrixRow[];
  loading?: boolean;
}

export function AttendanceMatrix({ month, rows, loading }: AttendanceMatrixProps) {
  if (!month) return null;

  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, monthNum - 1));
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden animate-pulse">
        <div className="h-10 bg-muted/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 border-t border-border/40 bg-muted/10" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border rounded-2xl shadow-sm flex items-center justify-center py-16 text-sm text-muted-foreground">
        No attendance data for this month
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead pinned className="top-0 z-30 p-2.5 min-w-[168px] normal-case tracking-normal">
              Employee
            </TableHead>
            {dayNumbers.map(d => (
              <TableHead key={d} className="p-1 text-center w-9 min-w-[36px] normal-case tracking-normal">
                {d}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIdx) => (
            <TableRow
              key={row.employee_code}
              className={cn(rowIdx % 2 !== 0 && 'bg-muted/[0.03]')}
            >
              <TableCell pinned className="p-2">
                <div className="font-medium text-foreground leading-tight">{row.employee_name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{row.employee_code}</div>
              </TableCell>
              {dayNumbers.map(d => {
                const dateKey = `${month}-${String(d).padStart(2, '0')}`;
                const dayData = row.days[dateKey];
                const status = dayData?.status ?? 'default';
                const style = STATUS_STYLE[status] ?? 'bg-gray-50 text-gray-300';
                const abbr = STATUS_ABBR[status] ?? '·';
                const tooltipParts = [status];
                if (dayData?.in)  tooltipParts.push(`IN: ${dayData.in}`);
                if (dayData?.out) tooltipParts.push(`OUT: ${dayData.out}`);

                return (
                  <TableCell key={d} className="p-0.5" title={tooltipParts.join(' · ')}>
                    <div className={cn('rounded text-[10px] font-semibold py-1.5 text-center leading-none', style)}>
                      {abbr}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-border/50 bg-muted/10">
        {LEGEND.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-5 h-5 rounded text-[10px] font-semibold flex items-center justify-center', STATUS_STYLE[key])}>
              {STATUS_ABBR[key]}
            </div>
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
