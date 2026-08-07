'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
  Loader2, X, ArrowRightLeft, CheckCircle2, XCircle,
  Clock, Ban, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Transfer {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  from_branch_id: string | null;
  from_branch_name: string | null;
  to_branch_id: string;
  to_branch_name: string;
  from_department_name: string | null;
  to_department_name: string | null;
  transfer_type: string;
  effective_date: string;
  status: string;
  remarks: string | null;
  rejection_reason: string | null;
  requested_by_name: string | null;
  approved_by_name: string | null;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  branch_id: string | null;
}

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  branch_name: string | null;
  department_name: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700',   icon: Clock },
  approved:  { label: 'Approved',  cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-600',       icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500',     icon: Ban },
};

const TRANSFER_TYPES = ['permanent', 'deputation', 'rotation'];

function InitiateDrawer({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employees, setEmployees]     = useState<Employee[]>([]);
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm] = useState({
    employee_id:      '',
    to_branch_id:     '',
    to_department_id: '',
    transfer_type:    'permanent',
    effective_date:   '',
    remarks:          '',
  });

  useEffect(() => {
    Promise.all([
      api.get('/employees?limit=500'),
      api.get('/branches'),
      api.get('/departments'),
    ]).then(([eRes, bRes, dRes]) => {
      setEmployees(eRes.data.data || []);
      setBranches(bRes.data.data  || []);
      setDepartments(dRes.data.data || []);
    }).catch(() => {});
  }, []);

  const f = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const filteredDepts = form.to_branch_id
    ? departments.filter(d => d.branch_id === form.to_branch_id)
    : departments;

  const save = async () => {
    if (!form.employee_id)   { setError('Select an employee'); return; }
    if (!form.to_branch_id)  { setError('Select a destination branch'); return; }
    if (!form.effective_date){ setError('Effective date is required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/transfers', {
        ...form,
        to_department_id: form.to_department_id || null,
        remarks:          form.remarks || null,
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initiate transfer');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';
  const lbl = (t: string, req = false) => (
    <label className="text-xs font-medium text-muted-foreground block mb-1">
      {t}{req && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-bold">Initiate Transfer</h2>
            <p className="text-xs text-muted-foreground">Move an employee to a different branch</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          )}

          <div>
            {lbl('Employee', true)}
            <select value={form.employee_id} onChange={e => f('employee_id', e.target.value)} className={inputCls}>
              <option value="">— Select Employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.employee_code} — {e.first_name} {e.last_name}
                  {e.branch_name ? ` (${e.branch_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            {lbl('Destination Branch', true)}
            <select value={form.to_branch_id} onChange={e => { f('to_branch_id', e.target.value); f('to_department_id', ''); }} className={inputCls}>
              <option value="">— Select Branch —</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.code} – {b.name}</option>
              ))}
            </select>
          </div>

          <div>
            {lbl('Destination Department')}
            <select value={form.to_department_id} onChange={e => f('to_department_id', e.target.value)} className={inputCls}>
              <option value="">— Same / No Change —</option>
              {filteredDepts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {lbl('Transfer Type')}
              <select value={form.transfer_type} onChange={e => f('transfer_type', e.target.value)} className={inputCls}>
                {TRANSFER_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              {lbl('Effective Date', true)}
              <input type="date" value={form.effective_date} onChange={e => f('effective_date', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            {lbl('Remarks')}
            <textarea value={form.remarks} onChange={e => f('remarks', e.target.value)}
              rows={3} placeholder="Optional notes..."
              className={inputCls + ' resize-none'} />
          </div>
        </div>

        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Submit Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({
  transfer,
  onClose,
  onDone,
}: {
  transfer: Transfer;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const reject = async () => {
    setSaving(true);
    try {
      await api.put(`/transfers/${transfer.id}/reject`, { rejection_reason: reason });
      onDone(); onClose();
    } catch { /* no-op */ } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Reject Transfer</h3>
            <p className="text-xs text-muted-foreground">{transfer.employee_name} → {transfer.to_branch_name}</p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3} placeholder="Reason for rejection (optional)"
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none mb-4"
        />
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={reject} disabled={saving}>
            {saving ? 'Rejecting...' : 'Reject Transfer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Deputation extends Transfer {
  return_date: string | null;
  original_branch_name: string | null;
  deputation_notes: string | null;
}

export default function TransfersPage() {
  const [transfers, setTransfers]   = useState<Transfer[]>([]);
  const [deputations, setDeputations] = useState<Deputation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Transfer | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab]       = useState<'transfers' | 'deputations'>('transfers');
  const [reverting, setReverting] = useState(false);
  const [revertResult, setRevertResult] = useState<{ reverted: number } | null>(null);

  useEffect(() => { fetchTransfers(); }, [statusFilter]);
  useEffect(() => { if (tab === 'deputations') fetchDeputations(); }, [tab]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/transfers${params}`);
      setTransfers(res.data.data || []);
    } catch { /* no-op */ } finally { setLoading(false); }
  };

  const fetchDeputations = async () => {
    try {
      const res = await api.get('/transfers/active-deputations');
      setDeputations(res.data.data || []);
    } catch { /* no-op */ }
  };

  const triggerReversions = async () => {
    setReverting(true);
    try {
      const res = await api.post('/transfers/process-deputation-reversions');
      setRevertResult(res.data.data);
      fetchDeputations();
    } catch { /* no-op */ } finally { setReverting(false); }
  };

  const approve = async (id: string) => {
    setActing(id);
    try {
      await api.put(`/transfers/${id}/approve`);
      fetchTransfers();
    } catch { /* no-op */ } finally { setActing(null); }
  };

  const cancel = async (id: string) => {
    setActing(id);
    try {
      await api.put(`/transfers/${id}/cancel`);
      fetchTransfers();
    } catch { /* no-op */ } finally { setActing(null); }
  };

  const pending  = transfers.filter(t => t.status === 'pending').length;
  const approved = transfers.filter(t => t.status === 'approved').length;

  return (
    <>
      {showDrawer && (
        <InitiateDrawer onClose={() => setShowDrawer(false)} onSaved={fetchTransfers} />
      )}
      {rejectTarget && (
        <RejectModal transfer={rejectTarget} onClose={() => setRejectTarget(null)} onDone={fetchTransfers} />
      )}

      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Branch Transfers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Initiate and approve employee branch transfers
            </p>
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setTab('transfers')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'transfers' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Transfers
            </button>
            <button
              onClick={() => setTab('deputations')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'deputations' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Deputations
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total',    val: transfers.length, cls: 'card-gradient-blue'   },
            { label: 'Pending',  val: pending,          cls: 'card-gradient-amber'  },
            { label: 'Approved', val: approved,         cls: 'card-gradient-emerald'},
            { label: 'Rejected', val: transfers.filter(t => t.status === 'rejected').length, cls: 'card-gradient-purple' },
          ].map(s => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.cls} text-white`}>
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.val}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {tab === 'deputations' && (
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700 flex-1">Active Deputations</h2>
              {revertResult && (
                <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                  {revertResult.reverted} deputation{revertResult.reverted !== 1 ? 's' : ''} auto-reverted
                </span>
              )}
              <Button size="sm" variant="outline" onClick={triggerReversions} disabled={reverting}>
                {reverting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Process Reversions
              </Button>
            </div>
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  {['Employee', 'From Branch', 'To Branch (Deputed)', 'Effective', 'Return Date', 'Notes', 'Status'].map(h => (
                    <TableHead key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {deputations.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No active deputations
                  </TableCell></TableRow>
                ) : deputations.map(d => {
                  const today = new Date().toISOString().split('T')[0];
                  const expired = d.return_date && d.return_date <= today;
                  return (
                    <TableRow key={d.id} className={`hover:bg-muted/30 transition-colors ${expired ? 'bg-amber-50/50' : ''}`}>
                      <TableCell className="px-4 py-3">
                        <p className="text-sm font-medium">{d.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{d.employee_code}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{d.from_branch_name || '—'}</TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="text-sm font-medium text-primary">{d.to_branch_name}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(d.effective_date).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                        {d.return_date ? (
                          <span className={expired ? 'text-amber-600 font-semibold' : 'text-gray-700'}>
                            {new Date(d.return_date).toLocaleDateString('en-IN')}
                            {expired && <span className="ml-1 text-xs text-amber-500">(overdue)</span>}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">
                        {(d as any).deputation_notes || '—'}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {tab === 'transfers' && <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => setShowDrawer(true)}>
              + Initiate Transfer
            </Button>
            <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1.5 text-sm">
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-sm bg-transparent focus:outline-none"
              >
                <option value="">All Status</option>
                {Object.keys(STATUS_META).map(s => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          <Table className="w-full">
            <TableHeader>
              <TableRow>
                {['Employee', 'From Branch', 'To Branch', 'Department', 'Type', 'Effective', 'Status', 'Requested By', 'Actions'].map(h => (
                  <TableHead key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-16">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Loading transfers...</p>
                </TableCell></TableRow>
              ) : transfers.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-16">
                  <ArrowRightLeft className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No transfers found</p>
                </TableCell></TableRow>
              ) : transfers.map((t, idx) => {
                const sm = STATUS_META[t.status] || STATUS_META.pending;
                const Icon = sm.icon;
                return (
                  <TableRow key={t.id} className="hover:bg-muted/30 transition-colors"
                    style={{ animation: `slideUp 0.3s ease ${idx * 0.03}s both` }}>
                    <TableCell className="px-4 py-3">
                      <p className="text-sm font-medium">{t.employee_name}</p>
                      <p className="text-xs text-muted-foreground">{t.employee_code}</p>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {t.from_branch_name || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-sm font-medium text-primary">{t.to_branch_name}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {t.to_department_name || t.from_department_name || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{t.transfer_type}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(t.effective_date).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sm.cls}`}>
                        <Icon className="w-3 h-3" />
                        {sm.label}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {t.requested_by_name || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {t.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => approve(t.id)}
                            disabled={acting === t.id}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-all disabled:opacity-50"
                            title="Approve"
                          >
                            {acting === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setRejectTarget(t)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-all"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancel(t.id)}
                            disabled={acting === t.id}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-all disabled:opacity-50"
                            title="Cancel"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {t.status === 'rejected' && t.rejection_reason && (
                        <p className="text-xs text-muted-foreground max-w-[160px] truncate" title={t.rejection_reason}>
                          {t.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>}
      </div>
    </>
  );
}
