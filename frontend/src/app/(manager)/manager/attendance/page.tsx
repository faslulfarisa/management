'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Users, CalendarDays, Search, Clock, Coffee,
  CheckCircle, AlertTriangle, XCircle, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export default function ManagerAttendancePage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');

  // Fetch employees list
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['manager-employees'],
    queryFn: () => api.get('/employees?limit=1000').then(r => r.data.data ?? []),
    staleTime: 60_000,
  });

  // Fetch attendance records for the selected date
  const { data: attendanceData, isLoading: loadingAttendance, refetch, isRefetching } = useQuery({
    queryKey: ['manager-attendance', date],
    queryFn: () => api.get('/attendance', { params: { date } }).then(r => r.data.data ?? r.data ?? []),
    staleTime: 30_000,
  });

  // Fetch employees currently on a break
  const { data: activeBreaksData, isLoading: loadingActiveBreaks } = useQuery({
    queryKey: ['manager-active-breaks'],
    queryFn: () => api.get('/attendance/breaks/active').then(r => r.data.data ?? []),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const employees = employeesData || [];
  const attendanceList = Array.isArray(attendanceData) ? attendanceData : [];
  const activeBreaks = Array.isArray(activeBreaksData) ? activeBreaksData : [];

  // Match attendance records to employees to construct team statuses
  const teamRoster = employees.map((emp: any, index: number) => {
    const record = attendanceList.find((att: any) => att.employee_id === emp.id || att.employee_code === emp.employee_code);
    return {
      id: emp.id,
      name: `${emp.first_name} ${emp.last_name}`,
      first_name: emp.first_name,
      code: emp.employee_code,
      department: emp.department_name || 'Unassigned',
      designation: emp.designation_name || '—',
      status: record?.status || 'absent',
      clock_in: record?.clock_in ? format(new Date(record.clock_in), 'hh:mm a') : '—',
      clock_out: record?.clock_out ? format(new Date(record.clock_out), 'hh:mm a') : '—',
      late_minutes: record?.late_minutes ?? 0,
      overtime_minutes: record?.overtime_minutes ?? 0,
      shift_name: record?.shift_name || emp.shift_name || 'General Shift',
      shift_start: record?.shift_start || '09:00',
      shift_end: record?.shift_end || '17:00',
      index
    };
  });

  // Apply search filtering
  const filteredRoster = teamRoster.filter((item: any) => 
    search === '' || 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.code.toLowerCase().includes(search.toLowerCase())
  );

  // Compute metrics
  const totalCount = filteredRoster.length;
  const presentCount = filteredRoster.filter((r: any) => ['present', 'late', 'half_day'].includes(r.status)).length;
  const lateCount = filteredRoster.filter((r: any) => r.status === 'late').length;
  const absentCount = filteredRoster.filter((r: any) => r.status === 'absent').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Present</span>;
      case 'late':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Late</span>;
      case 'half_day':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">Half Day</span>;
      case 'absent':
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">Absent</span>;
    }
  };

  const getAvatarGradient = (i: number) => {
    const gradients = [
      'from-blue-500 to-blue-600',
      'from-emerald-500 to-emerald-600',
      'from-purple-500 to-purple-600',
      'from-indigo-500 to-indigo-600',
      'from-teal-500 to-teal-600',
      'from-rose-500 to-rose-600',
    ];
    return gradients[i % gradients.length];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 shadow-md">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Team Attendance</h1>
            <p className="text-xs text-slate-400 mt-0.5">Track live punch clocks, active shifts, and daily statuses</p>
          </div>
        </div>

        <button 
          onClick={() => refetch()}
          className="self-start sm:self-center flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 bg-white hover:bg-slate-50 transition-colors shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Roster Metrics Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Team', value: totalCount, icon: Users, color: 'text-slate-700 bg-slate-100' },
          { label: 'Present Today', value: presentCount, icon: CheckCircle, color: 'text-emerald-700 bg-emerald-50' },
          { label: 'Late Clock-in', value: lateCount, icon: Clock, color: 'text-amber-700 bg-amber-50' },
          { label: 'Absent today', value: absentCount, icon: XCircle, color: 'text-red-700 bg-red-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-900 leading-none">{loadingEmployees || loadingAttendance ? '...' : value}</p>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white border border-slate-200/80 p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-slate-50/50 focus:bg-white transition-all font-semibold"
            placeholder="Search team member name or employee code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <input
          type="date"
          className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold text-slate-700 shrink-0 transition-colors"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Active Breaks panel */}
      {!loadingActiveBreaks && activeBreaks.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Coffee className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-bold text-slate-700">On Break Now</p>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {activeBreaks.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {activeBreaks.map((b: any) => {
              const elapsed = Math.floor(b.elapsed_minutes ?? 0);
              const allowed = b.allowed_minutes;
              const isOverdue = allowed != null && elapsed > allowed;
              return (
                <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {b.first_name} {b.last_name}
                      <span className="text-[10px] text-slate-400 font-mono ml-2">{b.employee_code}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {b.reason_label} · since {format(new Date(b.started_at), 'hh:mm a')}
                      {b.note && <span className="italic"> · "{b.note}"</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">
                      {elapsed}m{allowed != null ? ` / ${allowed}m` : ''}
                    </span>
                    {isOverdue ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        On Break
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attendance Roster list */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        {loadingEmployees || loadingAttendance ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-semibold">Fetching team records...</p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <Users className="w-10 h-10 text-slate-200 mx-auto" />
            <p className="text-sm font-bold">No team members match your query</p>
            <p className="text-xs">Adjust search keywords or filters to retrieve roster details.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Shift Schedule</TableHead>
                    <TableHead>Punches (In/Out)</TableHead>
                    <TableHead>Late (Min)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoster.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${getAvatarGradient(item.index)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                            {item.first_name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 leading-none">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-1">Code: {item.code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold text-slate-700">{item.designation}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.department}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-bold text-slate-700">{item.shift_name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.shift_start} - {item.shift_end}</p>
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-slate-800">
                        {item.clock_in} / {item.clock_out}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {item.late_minutes > 0 ? (
                          <span className="text-amber-600 font-bold">{item.late_minutes} min</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(item.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredRoster.map((item: any) => (
                <div key={item.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-tr ${getAvatarGradient(item.index)} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}>
                        {item.first_name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 leading-none">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">Code: {item.code}</p>
                      </div>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50/60 p-2.5 rounded-xl border border-slate-100 font-semibold text-slate-600">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Shift Schedule</p>
                      <p className="text-slate-700 mt-0.5 truncate">{item.shift_name}</p>
                      <p className="text-slate-400 text-[10px] mt-0.5">{item.shift_start} - {item.shift_end}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Clock (In/Out)</p>
                      <p className="text-slate-800 mt-0.5 font-mono text-[10px]">{item.clock_in} / {item.clock_out}</p>
                      {item.late_minutes > 0 && (
                        <p className="text-amber-600 font-bold text-[9px] mt-0.5">Late: {item.late_minutes}m</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
