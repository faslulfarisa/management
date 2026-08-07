'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  TrendingUp,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { shiftOverrideApi } from '@/lib/shift-override-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

const schema = z.object({
  employee_id: z.string().min(1, 'Employee is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  reason_category: z.string().min(1, 'Reason is required'),
  detailed_reason: z.string().min(5, 'Detailed reason must be at least 5 characters'),
  urgency: z.string().default('medium'),
  preferred_action: z.string().optional(),
  remarks: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function ShiftOverridesDashboard() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    status: '',
    employee_id: '',
    date_from: '',
    date_to: '',
    page: 1,
    limit: 10,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      urgency: 'medium',
      preferred_action: 'manager_decision',
    },
  });

  const watchStartDate = watch('start_date');

  useEffect(() => {
    if (watchStartDate) {
      setValue('end_date', watchStartDate);
    }
  }, [watchStartDate, setValue]);

  // Load lists for creating override on behalf
  useEffect(() => {
    if (createOpen) {
      api.get('/employees').then((res) => {
        setEmployees(res.data.data || []);
      });
    }
  }, [createOpen]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['shift-override-statistics'],
    queryFn: () => shiftOverrideApi.statistics(),
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['shift-override-list', filters],
    queryFn: () => shiftOverrideApi.list(filters),
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => shiftOverrideApi.submit(data),
    onSuccess: () => {
      reset();
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['shift-override-statistics'] });
      queryClient.invalidateQueries({ queryKey: ['shift-override-list'] });
    },
  });

  const filteredEmployees = employees.filter((e) => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase();
    const code = (e.employee_code || '').toLowerCase();
    return name.includes(empSearch.toLowerCase()) || code.includes(empSearch.toLowerCase());
  });

  const handleStatusFilterChange = (status: string) => {
    setFilters((f) => ({ ...f, status, page: 1 }));
  };

  const pieData = stats?.frequency_by_category?.map((item: any) => ({
    name: item.reason_category,
    value: parseInt(item.count, 10),
  })) || [];

  const barData = stats?.frequency_by_department?.map((item: any) => ({
    name: item.department_name,
    count: parseInt(item.count, 10),
  })) || [];

  return (
    <div className="space-y-6 p-6 bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/hr/schedules"
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors shadow-sm"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Shift Override Management</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage temporary schedule overrides, replacement coverage, and statistics</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold gap-1.5 h-10 shadow-md rounded-xl">
          <Plus className="h-4 w-4" />
          Log Temporary Override
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Approved</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-850 mt-2">
            {stats?.preferred_actions_count?.reduce((a: number, b: any) => a + parseInt(b.count, 10), 0) || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Overridden shift periods</span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Overrides</span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-850 mt-2">
            {listData?.total || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Current active or pending overrides</span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Approval Time</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-850 mt-2">
            {stats?.avg_approval_time_hours || '0.0'} hrs
          </p>
          <span className="text-[10px] text-slate-400 font-medium">To resolve request chain</span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Coverage Rate</span>
            <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-850 mt-2">
            94.2%
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Successful shift replacements</span>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Overrides by Reason</h3>
          <div className="h-60">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                No statistics data available
              </div>
            )}
          </div>
          {/* Custom legend */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {pieData.map((d: any, i: number) => (
              <div key={d.name} className="flex items-center gap-1.5 min-w-0">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[10px] text-slate-500 font-semibold truncate">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Department Overrides Frequency</h3>
          <div className="h-64">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ left: -10, right: 10, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontStyle="bold" />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                No statistics data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table / List */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-800">Overrides List & Audit Log</h2>
          <div className="flex items-center gap-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-full sm:w-48"
                placeholder="Search requests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900 font-semibold text-slate-600 bg-background"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !listData?.data || listData.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Calendar className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-xs font-semibold">No shift overrides found</p>
            <p className="text-[10px] mt-0.5">Adjust status or check again later</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  {['Employee', 'Dates', 'Original Shift', 'Action Taken', 'Urgency', 'Status', 'Resolved By'].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {listData.data
                  .filter((r) => {
                    const name = `${r.first_name} ${r.last_name}`.toLowerCase();
                    return name.includes(searchQuery.toLowerCase()) || (r.detailed_reason || '').toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-xs font-bold text-slate-800">{row.first_name} {row.last_name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{row.employee_code}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs font-semibold text-slate-700">{row.start_date}</p>
                        {row.end_date !== row.start_date && (
                          <p className="text-[10px] text-slate-400 mt-0.5">to {row.end_date}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs font-medium text-slate-600">{row.current_shift_name || 'General Shift'}</p>
                      </td>
                      <td className="px-5 py-4">
                        {row.action_type ? (
                          <span className="text-xs font-semibold text-slate-700 capitalize">
                            {row.action_type.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Not decided yet</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${
                          row.urgency === 'critical' || row.urgency === 'high' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {row.urgency}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                          row.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          row.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-500">
                        {row.approved_by ? 'Manager' : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log override modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="border-b border-gray-100 pb-3">
            <DialogTitle className="text-base font-bold text-slate-800">
              Log Temporary Shift Override
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Log an override request on behalf of an employee. This triggers the approvals workflow.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Employee</label>
              <Input
                placeholder="Search employee..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="h-10 text-xs mb-1.5"
              />
              <select
                {...register('employee_id')}
                className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
              >
                <option value="">Select employee…</option>
                {filteredEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name} ({e.employee_code})
                  </option>
                ))}
              </select>
              {errors.employee_id && <p className="text-xs text-red-500 font-semibold">{errors.employee_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                <Input type="date" {...register('start_date')} className="h-10 text-xs" />
                {errors.start_date && <p className="text-xs text-red-500 font-semibold">{errors.start_date.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                <Input type="date" {...register('end_date')} className="h-10 text-xs" />
                {errors.end_date && <p className="text-xs text-red-500 font-semibold">{errors.end_date.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</label>
                <select
                  {...register('reason_category')}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
                >
                  <option value="">Select Reason…</option>
                  {['Medical', 'Personal Emergency', 'Schedule Conflict', 'Official Duty', 'Custom'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.reason_category && <p className="text-xs text-red-500 font-semibold">{errors.reason_category.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Urgency</label>
                <select
                  {...register('urgency')}
                  className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preferred Action</label>
              <select
                {...register('preferred_action')}
                className="w-full h-10 px-3 text-xs rounded-lg border border-gray-200 bg-background focus:outline-none"
              >
                <option value="manager_decision">Manager Decision</option>
                <option value="assign_replacement">Assign another employee</option>
                <option value="swap_shift">Swap with another employee</option>
                <option value="move_shift">Move to another shift</option>
                <option value="convert_to_leave">Convert to Leave</option>
                <option value="cancel_shift">Cancel Shift</option>
              </select>
              {errors.preferred_action && <p className="text-xs text-red-500 font-semibold">{errors.preferred_action.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detailed Reason</label>
              <textarea
                {...register('detailed_reason')}
                rows={2}
                placeholder="Explain the override context..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              {errors.detailed_reason && <p className="text-xs text-red-500 font-semibold">{errors.detailed_reason.message}</p>}
            </div>

            {createMutation.isError && (
              <p className="text-xs text-red-500 text-center font-bold">
                {(createMutation.error as any)?.response?.data?.message || 'Creation failed.'}
              </p>
            )}

            <DialogFooter className="gap-2 border-t border-gray-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="h-10 text-xs font-bold">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="h-10 text-xs font-bold bg-slate-950 hover:bg-slate-900 text-white rounded-lg"
              >
                {createMutation.isPending ? 'Logging...' : 'Submit Override'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
