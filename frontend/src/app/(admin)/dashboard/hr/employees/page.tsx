'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Loader2, Upload, ArrowRightLeft, X, Activity, Clock, CheckCircle2, XCircle, Ban,
} from 'lucide-react';
import BulkImportDrawer from '@/components/ui/bulk-import-drawer';
import { AttendanceStatusModal } from '@/components/ui/attendance-status-modal';
import { EmployeeDeletionModal } from '@/components/ui/employee-deletion-modal';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  status: string;
  department_name: string | null;
  designation_name: string | null;
  property_name: string | null;
  date_of_joining: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  confirmed: 'bg-blue-100 text-blue-800',
  inactive: 'bg-gray-100 text-gray-800',
  probation: 'bg-yellow-100 text-yellow-800',
  on_leave: 'bg-purple-100 text-purple-800',
  suspended: 'bg-orange-100 text-orange-800',
  resigned: 'bg-slate-100 text-slate-700',
  terminated: 'bg-red-100 text-red-800',
  retired: 'bg-indigo-100 text-indigo-800',
};

const EMPLOYEE_STATUSES = [
  'active', 'probation', 'confirmed', 'on_leave', 'suspended',
  'inactive', 'resigned', 'terminated', 'retired',
] as const;

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  probation: 'Probation',
  confirmed: 'Confirmed',
  on_leave: 'On Leave',
  suspended: 'Suspended',
  inactive: 'Inactive',
  resigned: 'Resigned',
  terminated: 'Terminated',
  retired: 'Retired',
};

const ATTENDANCE_FILTER_LABELS: Record<string, string> = {
  present_today: 'Present Today',
  punched_in: 'Currently Punched In',
  absent_today: 'Absent Today',
  late_today: 'Late Arrivals',
  early_leave_today: 'Early Leave',
};

const TRANSFER_STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700',    Icon: Clock },
  approved:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-600',        Icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500',      Icon: Ban },
};

function TransferHistoryModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/transfers?employee_id=${employee.id}`)
      .then(r => setTransfers(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Transfer History - {employee.first_name} {employee.last_name}
            </h2>
            <p className="text-xs text-muted-foreground">{employee.employee_code}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowRightLeft className="w-10 h-10 opacity-20 mb-3" />
              <p className="text-sm">No transfer records found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map(t => {
                const sm = TRANSFER_STATUS_META[t.status] || TRANSFER_STATUS_META.pending;
                const Icon = sm.Icon;
                return (
                  <div key={t.id} className="flex items-start gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${sm.cls}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {t.from_branch_name || '-'} {'->'} {t.to_branch_name}
                        </span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{t.transfer_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sm.cls}`}>{sm.label}</span>
                      </div>
                      {t.to_department_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Dept: {t.to_department_name}</p>
                      )}
                      {t.remarks && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{t.remarks}</p>
                      )}
                      {t.rejection_reason && (
                        <p className="text-xs text-red-600 mt-0.5">Rejected: {t.rejection_reason}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">
                        {new Date(t.effective_date).toLocaleDateString('en-IN')}
                      </p>
                      <p className="text-xs text-muted-foreground">effective</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RegularEmployeeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeOrganization, userType } = useAuthStore();
  const isOrgAdminUser = !!activeOrganization?.isOrgAdmin || userType === 'org_admin';
  const isBranchAdminUser = userType === 'branch_admin';
  const isAdmin = isOrgAdminUser;
  const hasCreatePermission = useCan(PERMISSIONS.EMPLOYEES_CREATE);
  const hasEditPermission = useCan(PERMISSIONS.EMPLOYEES_EDIT);
  const canCreateEmployee = isAdmin || hasCreatePermission;
  const canEditEmployee = isAdmin || hasEditPermission;
  const canDeleteEmployee = isOrgAdminUser;
  const canDeactivateEmployee = isBranchAdminUser;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState(searchParams.get('attendance') ?? '');
  const [branches, setBranches] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>(null);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [transferHistoryEmp, setTransferHistoryEmp] = useState<Employee | null>(null);
  const [attendanceStatusEmp, setAttendanceStatusEmp] = useState<Employee | null>(null);
  const [deletionTargetEmp, setDeletionTargetEmp] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const EMPLOYEE_BULK_COLUMNS = [
    { key: 'employee_code', label: 'Employee Code', required: true, placeholder: 'EMP001', width: '110px' },
    { key: 'first_name', label: 'First Name', required: true, width: '110px' },
    { key: 'last_name', label: 'Last Name', required: true, width: '110px' },
    { key: 'gender', label: 'Gender', type: 'select' as const, options: ['male', 'female', 'other'], width: '100px' },
    { key: 'date_of_joining', label: 'Joining Date', required: true, type: 'date' as const, width: '130px' },
    { key: 'personal_email', label: 'Email', type: 'email' as const, width: '160px' },
    { key: 'personal_phone', label: 'Phone', placeholder: '9XXXXXXXXX', width: '120px' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' as const, width: '130px' },
    { key: 'pan_number', label: 'PAN', placeholder: 'ABCDE1234F', width: '110px' },
    { key: 'aadhaar_number', label: 'Aadhaar', placeholder: '12 digits', width: '120px' },
  ];

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (branchFilter) params.branch_id = branchFilter;
      if (attendanceFilter) params.attendance = attendanceFilter;
      const { data } = await api.get('/employees', { params });
      setEmployees(data.data);
      setMeta(data.meta);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [page, search, statusFilter, branchFilter, attendanceFilter]);

  const clearAttendanceFilter = () => {
    setAttendanceFilter('');
    setPage(1);
    router.replace('/dashboard/hr/employees');
  };

  const handleStatusChange = async (emp: Employee, newStatus: string) => {
    setEditingStatusId(null);
    if (newStatus === emp.status) return;
    const prevStatus = emp.status;
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: newStatus } : e));
    setStatusUpdatingId(emp.id);
    try {
      await api.patch(`/employees/${emp.id}/status`, { status: newStatus });
    } catch (err: any) {
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status: prevStatus } : e));
      alert(err.response?.data?.message || 'Failed to update employee status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (emp.status === 'inactive') {
      setDeletionTargetEmp(emp);
      return;
    }

    const confirmed = window.confirm(`Delete ${emp.first_name} ${emp.last_name}? This will remove the employee from active listings.`);
    if (!confirmed) return;

    setDeletingEmployeeId(emp.id);
    try {
      await api.delete(`/employees/${emp.id}`);
      await fetchEmployees();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete employee');
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  const handleDeactivateEmployee = async (emp: Employee) => {
    if (emp.status === 'inactive') return;

    const confirmed = window.confirm(`Deactivate ${emp.first_name} ${emp.last_name}?`);
    if (!confirmed) return;

    await handleStatusChange(emp, 'inactive');
  };

  return (
    <>
      {transferHistoryEmp && (
        <TransferHistoryModal employee={transferHistoryEmp} onClose={() => setTransferHistoryEmp(null)} />
      )}
      {showBulkDrawer && (
        <BulkImportDrawer
          title="Employees"
          subtitle="Import multiple employees at once using manual entry or a CSV file"
          columns={EMPLOYEE_BULK_COLUMNS}
          onClose={() => setShowBulkDrawer(false)}
          onSubmitRow={(row) => api.post('/employees', row)}
          onAllDone={fetchEmployees}
        />
      )}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Employee Master</h1>
            <p className="text-muted-foreground">Manage employee records and lifecycle events</p>
          </div>
          {canCreateEmployee && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBulkDrawer(true)}>
                <Upload className="w-4 h-4 mr-2" />Bulk Import
              </Button>
              <Button onClick={() => router.push('/dashboard/hr/employees/new')}>+ Add Employee</Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <Input
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="max-w-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Status</option>
                {EMPLOYEE_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {attendanceFilter && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              Filtered by: {ATTENDANCE_FILTER_LABELS[attendanceFilter] ?? attendanceFilter}
              <button onClick={clearAttendanceFilter} className="p-0.5 rounded-full hover:bg-primary/20">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joining Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : employees.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="p-8 text-center text-muted-foreground">No employees found</TableCell></TableRow>
                ) : (
                  employees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-mono text-xs">{emp.employee_code}</TableCell>
                      <TableCell>{emp.first_name} {emp.last_name}</TableCell>
                      <TableCell>{(emp as any).branch_name || '-'}</TableCell>
                      <TableCell>{emp.department_name || '-'}</TableCell>
                      <TableCell>{emp.designation_name || '-'}</TableCell>
                      <TableCell>
                        {canEditEmployee && editingStatusId === emp.id ? (
                          <select
                            autoFocus
                            value={emp.status}
                            disabled={statusUpdatingId === emp.id}
                            onChange={(e) => handleStatusChange(emp, e.target.value)}
                            onBlur={() => setEditingStatusId(null)}
                            className="border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {EMPLOYEE_STATUSES.map(s => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[emp.status] || 'bg-gray-100'} ${canEditEmployee ? 'cursor-pointer hover:ring-2 hover:ring-primary/30' : ''}`}
                            onClick={() => canEditEmployee && setEditingStatusId(emp.id)}
                            title={canEditEmployee ? 'Click to change status' : undefined}
                          >
                            {statusUpdatingId === emp.id ? (
                              <Loader2 className="w-3 h-3 animate-spin inline" />
                            ) : (
                              STATUS_LABELS[emp.status] || emp.status
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/hr/employees/${emp.id}`)}>View</Button>
                          {canEditEmployee && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/hr/employees/${emp.id}/edit`)}>Edit</Button>
                              <Button variant="ghost" size="sm" title="Transfer History" onClick={() => setTransferHistoryEmp(emp)}>
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" title="Attendance Status" onClick={() => setAttendanceStatusEmp(emp)}>
                            <Activity className="w-3.5 h-3.5" />
                          </Button>
                          {canDeleteEmployee && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingEmployeeId === emp.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title={emp.status === 'inactive' ? 'Permanently delete inactive employee' : 'Delete employee'}
                              onClick={() => handleDeleteEmployee(emp)}
                            >
                              {deletingEmployeeId === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Delete'}
                            </Button>
                          )}
                          {canDeactivateEmployee && emp.status !== 'inactive' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={statusUpdatingId === emp.id}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Deactivate employee"
                              onClick={() => handleDeactivateEmployee(emp)}
                            >
                              {statusUpdatingId === emp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Deactivate'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {meta.total} employees
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="px-3 py-2 text-sm">Page {meta.page} of {meta.total_pages}</span>
              <Button variant="outline" size="sm" disabled={page === meta.total_pages} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Live biometric attendance status */}
      {attendanceStatusEmp && (
        <AttendanceStatusModal employee={attendanceStatusEmp} onClose={() => setAttendanceStatusEmp(null)} />
      )}

      {/* Permanent delete — dependency review, retention selection, impact summary */}
      {deletionTargetEmp && (
        <EmployeeDeletionModal
          employee={deletionTargetEmp}
          onClose={() => setDeletionTargetEmp(null)}
          onDeleted={fetchEmployees}
        />
      )}
    </>
  );
}

/* ── Page entry point ──────────────────────────────────────────────────── */
export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <RegularEmployeeView />
    </Suspense>
  );
}
