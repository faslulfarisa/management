'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Loader2, CalendarDays, Plus } from 'lucide-react';
import { ApprovalReasonModal } from '@/components/approvals/approval-reason-modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import { PERMISSIONS } from '@/lib/permissions';

/* ── Leave Request Drawer ─────────────────────────────────────────────── */
function LeaveRequestDrawer({ leaveTypes, onClose, onSaved }: { leaveTypes: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.leave_type_id) e.leave_type_id = 'Please select a leave type';
    if (!form.start_date) e.start_date = 'Start date is required';
    if (!form.end_date) e.end_date = 'End date is required';
    if (form.start_date && form.end_date && form.start_date > form.end_date) e.end_date = 'End date must be on or after start date';
    if (!form.reason.trim()) e.reason = 'Please provide a reason for the leave';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.post('/leaves/requests', form);
      onSaved();
      onClose();
    } catch (err: any) {
      const msg: string =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Failed to submit leave request';
      setErrors({ _: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">New Leave Request</h2>
            <p className="text-xs text-muted-foreground">Submit a leave application</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errors._ && (() => {
            const isNoBalance = errors._.includes('No leave balance is available');
            return isNoBalance ? (
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                <svg className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" /></svg>
                <div>
                  <p className="text-xs font-semibold text-amber-800">Insufficient balance</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your assigned Leave Policy Template does not include this leave type, or you have no balance.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors._}</p>
            );
          })()}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Leave Type <span className="text-red-500">*</span></label>
            <select value={form.leave_type_id} onChange={e => setForm({ ...form, leave_type_id: e.target.value })} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.leave_type_id ? 'border-red-400' : 'border-border'}`}>
              <option value="">Select leave type…</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
            {errors.leave_type_id && <p className="text-xs text-red-500 mt-1">{errors.leave_type_id}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Start Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.start_date ? 'border-red-400' : 'border-border'}`} />
              {errors.start_date && <p className="text-xs text-red-500 mt-1">{errors.start_date}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">End Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.end_date ? 'border-red-400' : 'border-border'}`} />
              {errors.end_date && <p className="text-xs text-red-500 mt-1">{errors.end_date}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={4} placeholder="Describe the reason for your leave…" className={`w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 ${errors.reason ? 'border-red-400' : 'border-border'}`} />
            {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
          </div>
        </div>
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />} Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function LeavePage() {
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('requests');
  const [showForm, setShowForm] = useState(false);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [reasonModal, setReasonModal] = useState<{ open: boolean; action: 'approve' | 'reject'; id: string; title: string }>({
    open: false, action: 'approve', id: '', title: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [typesRes, balancesRes, requestsRes] = await Promise.all([
        api.get('/leaves/types', { params: { all: true } }),
        api.get('/leaves/balances'),
        api.get('/leaves/requests', {
          params: {
            page,
            limit: PAGE_SIZE,
            ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          },
        }),
      ]);
      setLeaveTypes(typesRes.data?.data || typesRes.data || []);
      setBalances(balancesRes.data?.data || balancesRes.data || []);
      setRequests(requestsRes.data?.data || requestsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter, page]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const openApprove = (r: any) =>
    setReasonModal({ open: true, action: 'approve', id: r.id, title: `Leave: ${r.first_name} ${r.last_name} (${r.leave_type_name})` });

  const openReject = (r: any) =>
    setReasonModal({ open: true, action: 'reject', id: r.id, title: `Leave: ${r.first_name} ${r.last_name} (${r.leave_type_name})` });

  const handleConfirm = async (reason: string) => {
    const { action, id } = reasonModal;
    await api.post(`/leaves/requests/${id}/${action}`, { reason });
    fetchData();
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <>
      {showForm && <LeaveRequestDrawer leaveTypes={leaveTypes} onClose={() => setShowForm(false)} onSaved={fetchData} />}
      <ApprovalReasonModal
        isOpen={reasonModal.open}
        action={reasonModal.action}
        requestTitle={reasonModal.title}
        onConfirm={handleConfirm}
        onClose={() => setReasonModal((m) => ({ ...m, open: false }))}
      />
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground">Manage leave types, balances, and requests</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary/90 shadow-lg shadow-primary/30">
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {leaveTypes.length === 0 ? (
          <div className="md:col-span-4 border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            No leave types configured.
          </div>
        ) : (
          leaveTypes.map((lt) => {
            const bal = balances.filter(b => b.leave_type_id === lt.id);
            const totalAllocated = bal.reduce((sum, b) => sum + parseFloat(b.allocated || 0), 0);
            const totalUsed = bal.reduce((sum, b) => sum + parseFloat(b.used || 0), 0);
            return (
              <Card key={lt.id}>
                <CardContent className="p-4">
                  <p className="font-medium">{lt.name}</p>
                  <p className="text-sm text-muted-foreground">Allocated: {totalAllocated} | Used: {totalUsed}</p>
                  <p className="text-lg font-bold mt-1">{totalAllocated - totalUsed} available</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="flex gap-2">
        <Button variant={activeTab === 'requests' ? 'default' : 'outline'} onClick={() => setActiveTab('requests')}>Requests</Button>
        <Button variant={activeTab === 'balances' ? 'default' : 'outline'} onClick={() => setActiveTab('balances')}>Balances</Button>
      </div>

      {activeTab === 'requests' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leave Requests</CardTitle>
            <div className="flex items-center gap-2">
              <ExportButton
                config={{
                  module: 'leave_requests',
                  title: 'Leave Requests',
                  permission: PERMISSIONS.LEAVE_EXPORT,
                  columns: [
                    { key: 'employee_code', header: 'Employee Code' },
                    { key: 'employee_name', header: 'Employee Name' },
                    { key: 'branch_name', header: 'Branch' },
                    { key: 'department_name', header: 'Department' },
                    { key: 'leave_type', header: 'Leave Type' },
                    { key: 'start_date', header: 'Start Date', type: 'date' },
                    { key: 'end_date', header: 'End Date', type: 'date' },
                    { key: 'days', header: 'Days', type: 'number' },
                    { key: 'status', header: 'Status' },
                    { key: 'reason', header: 'Reason' },
                  ],
                  defaultColumns: ['employee_code', 'employee_name', 'branch_name', 'leave_type', 'start_date', 'end_date', 'days', 'status'],
                  filenamePrefix: 'leave_requests',
                }}
                filters={{ status: statusFilter === 'all' ? undefined : statusFilter }}
                currentPageData={requests}
                totalRecords={requests.length > 0 ? undefined : 0}
              />
              <ImportButton
                config={{
                  module: 'leave_requests',
                  title: 'Leave Requests',
                  permission: PERMISSIONS.LEAVE_CREATE,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All statuses</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading...</p>
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="p-8 text-center text-muted-foreground">No requests</TableCell></TableRow>
                  ) : (
                    requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.first_name} {r.last_name}</TableCell>
                        <TableCell>{r.leave_type_name}</TableCell>
                        <TableCell>{new Date(r.start_date).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(r.end_date).toLocaleDateString()}</TableCell>
                        <TableCell>{r.days}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${statusColors[r.status] || 'bg-gray-100'}`}>
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {r.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => openApprove(r)}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => openReject(r)}>Reject</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">Page {page}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" disabled={requests.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'balances' && (
        <Card>
          <CardHeader><CardTitle>Leave Balances</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading...</p>
            ) : balances.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">No leave balances generated yet</p>
                <p className="text-xs text-muted-foreground mt-1">Leave balances are automatically generated based on assigned Leave Policy Templates.</p>
              </div>
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead>Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((b) => {
                    const pct = b.allocated > 0 ? Math.round((b.used / b.allocated) * 100) : 0;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.first_name} {b.last_name}</TableCell>
                        <TableCell>{b.leave_type_name}</TableCell>
                        <TableCell>{b.year}</TableCell>
                        <TableCell>{b.allocated}</TableCell>
                        <TableCell>{b.used}</TableCell>
                        <TableCell className={`font-semibold ${b.available <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>{b.available}</TableCell>
                        <TableCell className="w-28">
                          <div className="h-1.5 rounded-full bg-muted">
                            <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% used</p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
