'use client';

import { useState, useEffect } from 'react';
import { startOfWeek, endOfWeek, subDays, format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Calendar, AlertTriangle, Coffee } from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { SummaryStats } from '@/components/attendance/summary-stats';
import { DailyAttendanceGrid } from '@/components/attendance/daily-attendance-grid';
import { WeeklySummary } from '@/components/attendance/weekly-summary';
import { RequestModal } from '@/components/attendance/request-modal';

export default function AttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'requests' | 'breaks'>('daily');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [violationsFrom, setViolationsFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [violationsTo, setViolationsTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [overviewView, setOverviewView] = useState<'weekly' | 'monthly'>('weekly');
  const [currentPage, setCurrentPage] = useState(1);

  const ATTENDANCE_BULK_COLUMNS = [
    { key: 'employee_code', label: 'Employee Code', required: true, placeholder: 'EMP001', width: '120px' },
    { key: 'date', label: 'Date', required: true, type: 'date' as const, width: '130px' },
    { key: 'request_type', label: 'Type', required: true, type: 'select' as const, options: ['regularization', 'correction', 'leave'], width: '130px' },
    { key: 'clock_in', label: 'Clock In', placeholder: '09:00', width: '100px' },
    { key: 'clock_out', label: 'Clock Out', placeholder: '18:00', width: '100px' },
    { key: 'reason', label: 'Reason', required: true, placeholder: 'Reason for request', width: '200px' },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const weekStart = format(startOfWeek(new Date(selectedDate)), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date(selectedDate)), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');

      let dateFrom = selectedDate;
      let dateTo = selectedDate;
      if (activeTab === 'weekly') {
        dateFrom = overviewView === 'weekly' ? weekStart : monthStart;
        dateTo = overviewView === 'weekly' ? weekEnd : monthEnd;
      }

      const [recordsRes, summaryRes, requestsRes] = await Promise.all([
        api.get('/attendance', {
          params: {
            page: 1,
            limit: 500,
            date_from: dateFrom,
            date_to: dateTo
          }
        }),
        api.get('/attendance/summary', {
          params: {
            date_from: selectedDate,
            date_to: selectedDate
          }
        }),
        api.get('/attendance/requests'),
      ]);

      // Ensure records have all required fields
      const normalizedRecords = (recordsRes.data.data || []).map((record: any) => ({
        id: record.id,
        employee_id: record.employee_id,
        employee_code: record.employee_code || '',
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        date: record.date,
        clock_in: record.clock_in,
        clock_out: record.clock_out,
        status: record.status || 'absent',
        late_minutes: record.late_minutes || 0,
        overtime_minutes: record.overtime_minutes || 0,
      }));

      // Ensure summary has all statuses
      const summaryData = summaryRes.data.data || [];
      const statuses = ['present', 'absent', 'late', 'half_day'];
      const normalizedSummary = statuses.map(status => {
        const found = summaryData.find((s: any) => s.status === status);
        return {
          status,
          count: found ? found.count : 0
        };
      });

      setRecords(normalizedRecords);
      setSummary(normalizedSummary);
      setRequests(requestsRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, activeTab, overviewView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, activeTab, overviewView]);

  const fetchViolations = async () => {
    setViolationsLoading(true);
    try {
      const res = await api.get('/attendance/breaks/violations', {
        params: { date_from: violationsFrom, date_to: violationsTo },
      });
      setViolations(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch break violations:', err);
    } finally {
      setViolationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'breaks') {
      fetchViolations();
    }
  }, [activeTab, violationsFrom, violationsTo]);

  const handleApproveRequest = async (id: string) => {
    try {
      setRequestLoading(true);
      await api.post(`/attendance/requests/${id}/approve`);
      fetchData();
    } catch (err) {
      alert('Failed to approve request');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleRejectRequest = async (id: string, notes: string) => {
    try {
      setRequestLoading(true);
      await api.post(`/attendance/requests/${id}/reject`, { reason: notes });
      fetchData();
    } catch (err) {
      alert('Failed to reject request');
    } finally {
      setRequestLoading(false);
    }
  };

  const mappedSummary = summary.map((s) => ({
    status: s.status as 'present' | 'absent' | 'late' | 'half_day',
    count: s.count,
  }));

  const weekStartDate = startOfWeek(new Date(selectedDate));

  return (
    <div className="space-y-6">
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Attendance Requests"
          subtitle="Submit attendance regularization or correction requests for multiple employees"
          columns={ATTENDANCE_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/attendance/requests', row)}
          onAllDone={fetchData}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Attendance</h1>
          <p className="text-slate-600 mt-1">Track and manage employee attendance records</p>
        </div>
        <Button onClick={() => setShowBulkDrawer(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          Bulk Import
        </Button>
      </div>

      {/* Summary Stats */}
      <SummaryStats stats={mappedSummary} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'daily'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Daily Records
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'weekly'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'requests'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Requests {requests.filter((r) => r.status === 'pending').length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
              {requests.filter((r) => r.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('breaks')}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'breaks'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Break Violations
        </button>
      </div>

      {/* Date Range Picker for Break Violations */}
      {activeTab === 'breaks' && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <Calendar className="w-4 h-4 text-slate-600" />
          <Input
            type="date"
            value={violationsFrom}
            onChange={(e) => setViolationsFrom(e.target.value)}
            className="w-40 bg-white"
          />
          <span className="text-sm text-slate-500">to</span>
          <Input
            type="date"
            value={violationsTo}
            onChange={(e) => setViolationsTo(e.target.value)}
            className="w-40 bg-white"
          />
        </div>
      )}

      {/* Date Picker for Daily/Weekly */}
      {(activeTab === 'daily' || activeTab === 'weekly') && (
        <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <Calendar className="w-4 h-4 text-slate-600" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 bg-white"
          />
          <p className="text-sm text-slate-600">
            {activeTab === 'weekly' && `Week of ${format(weekStartDate, 'MMM d, yyyy')}`}
          </p>
        </div>
      )}

      {/* Content */}
      {activeTab === 'daily' && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          </h2>
          <DailyAttendanceGrid records={records} isLoading={loading} />
        </div>
      )}

      {activeTab === 'weekly' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setOverviewView('weekly')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  overviewView === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setOverviewView('monthly')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  overviewView === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {(() => {
            const grouped = Object.entries(
              records.reduce((acc, record) => {
                if (!acc[record.employee_id]) {
                  acc[record.employee_id] = {
                    employeeName: `${record.first_name} ${record.last_name}`,
                    employeeCode: record.employee_code,
                    records: [],
                  };
                }
                acc[record.employee_id].records.push({
                  date: format(new Date(record.date), 'yyyy-MM-dd'),
                  status: record.status,
                  clockIn: record.clock_in,
                  clockOut: record.clock_out,
                });
                return acc;
              }, {} as Record<string, any>)
            );

            if (grouped.length === 0) {
              return (
                <div className="flex items-center justify-center h-40 text-slate-500">
                  No attendance records found
                </div>
              );
            }

            const ITEMS_PER_PAGE = 6;
            const totalPages = Math.ceil(grouped.length / ITEMS_PER_PAGE);
            const paginated = grouped.slice(
              (currentPage - 1) * ITEMS_PER_PAGE,
              currentPage * ITEMS_PER_PAGE
            );

            return (
              <div className="space-y-6">
                {overviewView === 'weekly' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
                    {paginated.map(([employeeId, empData]: [string, any]) => {
                      const { employeeName, employeeCode, records: empRecords } = empData;
                      return (
                        <WeeklySummary
                          key={employeeId}
                          employeeName={employeeName}
                          employeeCode={employeeCode}
                          weekStartDate={weekStartDate}
                          records={empRecords}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                    {paginated.map(([employeeId, empData]: [string, any]) => {
                      const { employeeName, employeeCode, records: empRecords } = empData;
                      const monthStart = startOfMonth(new Date(selectedDate));
                      const monthEnd = endOfMonth(new Date(selectedDate));
                      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
                      const startDayOfWeek = monthStart.getDay();
                      const padding = Array.from({ length: startDayOfWeek }, (_, i) => null);

                      const presentCount = empRecords.filter((r: any) => r.status === 'present').length;
                      const lateCount = empRecords.filter((r: any) => r.status === 'late').length;
                      const absentCount = empRecords.filter((r: any) => r.status === 'absent').length;
                      const halfDayCount = empRecords.filter((r: any) => r.status === 'half_day').length;

                      return (
                        <div key={employeeId} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4 flex flex-col justify-between w-full">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                              <div>
                                <h3 className="font-semibold text-slate-800 text-sm truncate max-w-[150px]">{employeeName}</h3>
                                <p className="text-xs font-mono text-slate-400 mt-0.5">{employeeCode}</p>
                              </div>
                              <p className="text-xs font-medium text-slate-500 whitespace-nowrap">
                                {format(monthStart, 'MMM yyyy')}
                              </p>
                            </div>

                            {/* Scaled Calendar: ~75% size (3/4 Size) */}
                            <div className="grid grid-cols-7 gap-0.5 text-center max-w-[210px] mx-auto">
                              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
                                <div key={w} className="text-[8.5px] font-bold text-slate-400 py-0.5 uppercase">{w}</div>
                              ))}
                              {padding.map((_, pIdx) => (
                                <div key={`pad-${pIdx}`} className="w-6 h-6" />
                              ))}
                              {daysInMonth.map((day, dIdx) => {
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const record = empRecords.find((r: any) => r.date === dayStr);
                                let colorCls = 'bg-slate-50 border-slate-100 text-slate-400';
                                if (record) {
                                  if (record.status === 'present') colorCls = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                  if (record.status === 'absent') colorCls = 'bg-red-100 text-red-700 border-red-200';
                                  if (record.status === 'late') colorCls = 'bg-orange-100 text-orange-700 border-orange-200';
                                  if (record.status === 'half_day') colorCls = 'bg-blue-100 text-blue-700 border-blue-200';
                                }
                                return (
                                  <div
                                    key={dIdx}
                                    className={`w-6 h-6 mx-auto flex items-center justify-center rounded border text-[8px] font-semibold transition-all ${colorCls}`}
                                    title={record ? `${format(day, 'MMM d')}: ${record.status}` : format(day, 'MMM d')}
                                  >
                                    {format(day, 'd')}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t pt-3 grid grid-cols-4 gap-1 text-center text-[11px]">
                            <div>
                              <p className="text-[9px] font-medium text-slate-400 uppercase">Present</p>
                              <p className="font-bold text-emerald-600">{presentCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-slate-400 uppercase">Late</p>
                              <p className="font-bold text-orange-600">{lateCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-slate-400 uppercase">Half Day</p>
                              <p className="font-bold text-blue-600">{halfDayCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-slate-400 uppercase">Absent</p>
                              <p className="font-bold text-red-600">{absentCount}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Centered Pagination Control Panel */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8 bg-white p-3 border border-slate-200 rounded-xl shadow-sm max-w-sm mx-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="text-xs"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7.5 h-7.5 flex items-center justify-center rounded-lg text-xs font-bold border transition-all ${
                            currentPage === page
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="text-xs"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="flex items-center justify-center h-40 border border-dashed border-slate-200 rounded-lg bg-slate-50">
              <p className="text-slate-500">No attendance requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowRequestModal(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {request.first_name} {request.last_name}
                      </p>
                      <p className="text-sm text-slate-600">
                        {request.request_type} • {format(new Date(request.date), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-slate-600 mt-1">{request.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          request.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : request.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'breaks' && (
        <div className="space-y-6">
          {/* Repeat-offender summary */}
          {(() => {
            const byEmployee = violations.reduce((acc: Record<string, any>, v: any) => {
              const key = v.employee_id;
              if (!acc[key]) {
                acc[key] = {
                  name: `${v.first_name} ${v.last_name}`,
                  code: v.employee_code,
                  count: 0,
                  totalOverdue: 0,
                };
              }
              acc[key].count += 1;
              acc[key].totalOverdue += v.overdue_minutes || 0;
              return acc;
            }, {});
            const offenders = Object.values(byEmployee).sort((a: any, b: any) => b.count - a.count).slice(0, 6);

            if (violationsLoading || offenders.length === 0) return null;

            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {offenders.map((o: any) => (
                  <div key={`${o.code}-${o.name}`} className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-slate-900 truncate">{o.name}</p>
                    <p className="text-xs text-slate-500">{o.code}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-bold text-red-600">{o.count} violation{o.count !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-slate-500">{o.totalOverdue}m over</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Violations table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Break Type</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Allowed</TableHead>
                  <TableHead>Overdue By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {violationsLoading ? (
                  <TableRow><TableCell colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</TableCell></TableRow>
                ) : violations.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="px-4 py-8 text-center text-slate-400">No break violations in this date range</TableCell></TableRow>
                ) : violations.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{v.first_name} {v.last_name}</p>
                      <p className="text-xs text-slate-400 font-mono">{v.employee_code}</p>
                    </TableCell>
                    <TableCell className="text-slate-700">{format(new Date(v.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5 text-amber-500" />
                        {v.reason_label}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-700">{format(new Date(v.started_at), 'hh:mm a')}</TableCell>
                    <TableCell className="text-slate-700">{v.duration_minutes}m</TableCell>
                    <TableCell className="text-slate-700">{v.allowed_minutes != null ? `${v.allowed_minutes}m` : '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        {v.overdue_minutes}m
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Request Modal */}
      <RequestModal
        request={selectedRequest}
        isOpen={showRequestModal}
        onClose={() => {
          setShowRequestModal(false);
          setSelectedRequest(null);
        }}
        onApprove={handleApproveRequest}
        onReject={handleRejectRequest}
        isLoading={requestLoading}
      />
    </div>
  );
}
