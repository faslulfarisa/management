'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { exportReportCsv } from '@/lib/report-export';
import {
  Loader2, RefreshCw, Lock, Unlock, CheckCircle, XCircle, History,
  Download, ClipboardEdit, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type ScopeType = 'organization' | 'branch' | 'department' | 'employees' | 'employee';
interface Scope { type: ScopeType; branchId?: string; departmentId?: string; employeeIds?: string[] }

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  payroll_locked: 'bg-blue-100 text-blue-800',
  payroll_processed: 'bg-indigo-100 text-indigo-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const PAGE_SIZE = 20;

function SummaryStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ kpis }: { kpis: any | null }) {
  if (!kpis) return null;
  const cards = [
    { label: 'Pending Review', value: kpis.pendingReview, color: 'text-yellow-600' },
    { label: 'Approved', value: kpis.approved, color: 'text-green-600' },
    { label: 'Payroll Locked', value: kpis.payrollLocked, color: 'text-blue-600' },
    { label: 'Payroll Processed', value: kpis.payrollProcessed, color: 'text-indigo-600' },
    { label: 'Rejected', value: kpis.rejected, color: 'text-red-600' },
    { label: 'Avg Attendance %', value: `${(kpis.avgAttendancePct ?? 0).toFixed(1)}%`, color: 'text-slate-700' },
    { label: 'Avg OT Hours', value: (kpis.avgOtHours ?? 0).toFixed(1), color: 'text-slate-700' },
    { label: 'Avg Leave Days', value: (kpis.avgLeaveDays ?? 0).toFixed(1), color: 'text-slate-700' },
    { label: 'Avg Late Days', value: (kpis.avgLateDays ?? 0).toFixed(1), color: 'text-slate-700' },
    { label: 'Compliance %', value: `${(kpis.compliancePct ?? 0).toFixed(1)}%`, color: 'text-emerald-700' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-3 text-center">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Scope picker (shared by Compute and Lock) ───────────────────────────────

function ScopePicker({ value, onChange, branches, departments, employees }: {
  value: Scope; onChange: (v: Scope) => void;
  branches: any[]; departments: any[]; employees: any[];
}) {
  const LABELS: Record<ScopeType, string> = {
    organization: 'Entire Organization', branch: 'Branch', department: 'Department',
    employees: 'Selected Employees', employee: 'Single Employee',
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {(['organization', 'branch', 'department', 'employees'] as ScopeType[]).map((t) => (
          <button key={t} type="button" onClick={() => onChange({ type: t })}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              value.type === t ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}>
            {LABELS[t]}
          </button>
        ))}
      </div>
      {value.type === 'branch' && (
        <select value={value.branchId ?? ''} onChange={(e) => onChange({ ...value, branchId: e.target.value })}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">Select branch…</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      {value.type === 'department' && (
        <select value={value.departmentId ?? ''} onChange={(e) => onChange({ ...value, departmentId: e.target.value })}
          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">Select department…</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      {value.type === 'employees' && (
        <EmployeeMultiSelect
          employees={employees}
          selectedIds={value.employeeIds ?? []}
          onChange={(employeeIds) => onChange({ ...value, employeeIds })}
        />
      )}
    </div>
  );
}

function EmployeeMultiSelect({ employees, selectedIds, onChange }: {
  employees: any[]; selectedIds: string[]; onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = new Set(selectedIds);

  const filtered = employees.filter((emp) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${emp.first_name} ${emp.last_name} ${emp.employee_code}`.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border bg-muted/40">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{selectedIds.length} selected</span>
        {selectedIds.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-primary hover:underline whitespace-nowrap">
            Clear
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto divide-y divide-border/60">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No employees match.</p>
        ) : (
          filtered.map((emp) => {
            const isSelected = selected.has(emp.id);
            return (
              <label key={emp.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                }`}>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(emp.id)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/30" />
                <span className={isSelected ? 'font-medium text-foreground' : 'text-foreground'}>
                  {emp.first_name} {emp.last_name}
                </span>
                <span className="text-muted-foreground">({emp.employee_code})</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Generic reason-required modal (reject / request correction / lock / unlock) ─

function ReasonModal({ title, description, placeholder = 'Enter a reason…', confirmLabel, confirmClassName = 'bg-primary hover:bg-primary/90', extra, onConfirm, onClose }: {
  title: string; description?: string; placeholder?: string; confirmLabel: string; confirmClassName?: string;
  extra?: React.ReactNode;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) { setError('This field is required'); return; }
    setSaving(true); setError('');
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {extra}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={placeholder}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className={`gap-2 ${confirmClassName}`}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Version history modal ───────────────────────────────────────────────────

const COMPARE_FIELDS = ['business_working_days', 'present_days', 'paid_leave_days', 'unpaid_leave_days', 'payable_days', 'approved_ot_hours'];

function VersionHistoryModal({ summaryId, onClose }: { summaryId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/payroll/attendance-summary/${summaryId}/versions`)
      .then((r) => setVersions(r.data.data ?? []))
      .finally(() => setLoading(false));
  }, [summaryId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generation History</DialogTitle>
          <DialogDescription>Every computed version of this summary, newest first. Changed figures vs. the prior version are highlighted.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-2 py-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No version history yet.</div>
          ) : (
            versions.map((v, i) => {
              const prev = versions[i + 1];
              return (
                <div key={v.id} className="border border-border rounded-xl p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Version {v.generation_version}</span>
                    <span className="text-muted-foreground">{new Date(v.generated_at).toLocaleString()} · {v.reason}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {COMPARE_FIELDS.map((k) => {
                      const cur = v.snapshot?.[k];
                      const changed = prev && String(cur) !== String(prev.snapshot?.[k]);
                      return (
                        <div key={k}>
                          <p className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</p>
                          <p className={changed ? 'font-semibold text-amber-600' : 'font-medium'}>{cur}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

const SORTABLE: Record<string, string> = {
  employee: 'first_name', business_working_days: 'business_working_days', present_days: 'present_days',
  payable_days: 'payable_days', status: 'status',
};

export function AttendanceSummaryTab({ month, year }: { month: number; year: number }) {
  const canCompute = useCan(PERMISSIONS.PAYROLL_EDIT);
  const canApprove = useCan(PERMISSIONS.PAYROLL_APPROVE);
  const canLock = useCan(PERMISSIONS.PAYROLL_LOCK);
  const canUnlock = useCan(PERMISSIONS.PAYROLL_UNLOCK);

  const [summaries, setSummaries] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any | null>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    branch_id: '', department_id: '', employee_id: '', status: '', leave_type: '', attendance_state: '', search: '',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'employee', dir: 'asc' });
  const [page, setPage] = useState(1);

  const [computeOpen, setComputeOpen] = useState(false);
  const [computeScope, setComputeScope] = useState<Scope>({ type: 'organization' });
  const [lockOpen, setLockOpen] = useState(false);
  const [lockScope, setLockScope] = useState<Scope>({ type: 'organization' });
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<any | null>(null);
  const [versionTarget, setVersionTarget] = useState<string | null>(null);

  useEffect(() => {
    api.get('/branches').then((r) => setBranches(r.data.data ?? [])).catch(() => {});
    api.get('/departments').then((r) => setDepartments(r.data.data ?? [])).catch(() => {});
    api.get('/employees?limit=1000').then((r) => setEmployees(r.data.data ?? [])).catch(() => {});
    api.get('/leaves/types').then((r) => setLeaveTypes(r.data.data ?? [])).catch(() => {});
  }, []);

  const fetchSummaries = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { month: String(month), year: String(year) };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get('/payroll/attendance-summary', { params });
      setSummaries(res.data.data ?? []);
    } catch {
      setError('Failed to load attendance summaries');
    } finally {
      setLoading(false);
    }
  }, [month, year, filters]);

  const fetchKpis = useCallback(async () => {
    try {
      const params: Record<string, string> = { month: String(month), year: String(year) };
      if (filters.branch_id) params.branch_id = filters.branch_id;
      if (filters.department_id) params.department_id = filters.department_id;
      const res = await api.get('/payroll/attendance-summary/kpis', { params });
      setKpis(res.data.data ?? null);
    } catch {
      setKpis(null);
    }
  }, [month, year, filters.branch_id, filters.department_id]);

  useEffect(() => { fetchSummaries(); fetchKpis(); }, [fetchSummaries, fetchKpis]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filters, month, year]);

  const withAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key); setError('');
    try {
      await fn();
      await Promise.all([fetchSummaries(), fetchKpis()]);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const runCompute = async (scope: Scope) => {
    const body: any = { month, year, scope };
    if (scope.type === 'branch') body.branch_id = scope.branchId;
    await api.post('/payroll/attendance-summary/compute', body);
  };
  const recompute = (id: string) => withAction(`recompute-${id}`, async () => { await api.post(`/payroll/attendance-summary/${id}/recompute`); });
  const approve = (id: string) => withAction(`approve-${id}`, async () => { await api.put(`/payroll/attendance-summary/${id}/approve`); });
  const bulkApprove = () => withAction('bulk-approve', async () => {
    await Promise.all(Array.from(selected).map((id) => api.put(`/payroll/attendance-summary/${id}/approve`)));
    setSelected(new Set());
  });

  const runLock = async (scope: Scope, reason: string) => {
    const body: any = { month, year, scope, reason };
    if (scope.type === 'branch') body.branch_id = scope.branchId;
    await api.post('/payroll/attendance-summary/lock', body);
  };
  const runUnlock = async (reason: string) => {
    await api.post('/payroll/attendance-summary/unlock', { summaryIds: Array.from(selected), reason });
    setSelected(new Set());
  };

  const exportCsv = () => {
    const columns = [
      'Employee', 'Code', 'Branch', 'Department', 'Business Working Days', 'Present', 'Paid Leave',
      'Unpaid Leave', 'Holiday', 'Weekly Off', 'Absent', 'Late', 'Half Day', 'Approved OT Hours',
      'Payable Days', 'Status', 'Version', 'Last Generated',
    ];
    const rows = sortedSummaries.map((s) => [
      `${s.first_name} ${s.last_name}`, s.employee_code, s.branch_name ?? '', s.department_name ?? '',
      s.business_working_days, s.present_days, s.paid_leave_days, s.unpaid_leave_days, s.holiday_days,
      s.weekly_off_days, s.absent_days, s.late_count, s.half_day_count, s.approved_ot_hours, s.payable_days,
      s.status, s.generation_version, s.generated_at ? new Date(s.generated_at).toLocaleString() : '',
    ]);
    exportReportCsv({ columns, rows }, `attendance_summary_${year}_${month}`);
  };

  const sortedSummaries = useMemo(() => {
    const key = SORTABLE[sort.key] ?? 'first_name';
    const arr = [...summaries].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [summaries, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedSummaries.length / PAGE_SIZE));
  const pageRows = sortedSummaries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectedRows = summaries.filter((s) => selected.has(s.id));
  const canBulkLock = selectedRows.length > 0 && selectedRows.every((s) => s.status === 'approved');
  const canBulkUnlock = selectedRows.length > 0 && selectedRows.every((s) => ['payroll_locked', 'payroll_processed'].includes(s.status));
  const canBulkApprove = selectedRows.length > 0 && selectedRows.every((s) => s.status === 'pending_review');

  const SortHead = ({ k, children, className = '' }: { k: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none ${className}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-0.5">
        {children}
        {sort.key === k && (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {computeOpen && (
        <Dialog open onOpenChange={() => setComputeOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Compute Attendance Summaries</DialogTitle>
              <DialogDescription>Only unlocked summaries are recomputed — Payroll Locked / Processed rows are always skipped.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <ScopePicker value={computeScope} onChange={setComputeScope} branches={branches} departments={departments} employees={employees} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setComputeOpen(false)}>Cancel</Button>
              <Button onClick={() => withAction('compute', async () => { await runCompute(computeScope); setComputeOpen(false); })} disabled={!!actionLoading} className="gap-2">
                {actionLoading === 'compute' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Compute
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {lockOpen && (
        <Dialog open onOpenChange={() => setLockOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Lock for Payroll</DialogTitle>
              <DialogDescription>Locking is blocked if any Draft or Pending Review summaries remain in the selected scope.</DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <ScopePicker value={lockScope} onChange={setLockScope} branches={branches} departments={departments} employees={employees} />
              <ReasonInline onSubmit={(reason) => withAction('lock', async () => { await runLock(lockScope, reason); setLockOpen(false); })} loading={actionLoading === 'lock'} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {unlockOpen && (
        <ReasonModal
          title="Unlock Selected Summaries"
          description={`Reopens ${selected.size} locked/processed summary(ies) back to Approved. Requires authorization.`}
          confirmLabel="Unlock"
          confirmClassName="bg-amber-600 hover:bg-amber-700"
          onConfirm={runUnlock}
          onClose={() => setUnlockOpen(false)}
        />
      )}

      {rejectTarget && (
        <ReasonModal
          title="Reject Attendance Summary"
          description="A reason is required and will be visible to the employee's manager."
          placeholder="Why is this summary being rejected?"
          confirmLabel="Reject"
          confirmClassName="bg-red-600 hover:bg-red-700"
          onConfirm={async (reason) => { await withAction(`reject-${rejectTarget.id}`, async () => { await api.put(`/payroll/attendance-summary/${rejectTarget.id}/reject`, { reason }); }); }}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {correctionTarget && (
        <ReasonModal
          title="Request Correction"
          description="Sends this summary back to Draft so attendance/leave can be corrected before recomputing."
          placeholder="What needs to be corrected?"
          confirmLabel="Request Correction"
          confirmClassName="bg-amber-600 hover:bg-amber-700"
          onConfirm={async (notes) => { await withAction(`correction-${correctionTarget.id}`, async () => { await api.put(`/payroll/attendance-summary/${correctionTarget.id}/request-correction`, { notes }); }); }}
          onClose={() => setCorrectionTarget(null)}
        />
      )}

      {versionTarget && <VersionHistoryModal summaryId={versionTarget} onClose={() => setVersionTarget(null)} />}

      <KpiCards kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        {canCompute && (
          <Button variant="outline" onClick={() => setComputeOpen(true)} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Compute / Refresh
          </Button>
        )}
        {canLock && (
          <Button onClick={() => setLockOpen(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Lock className="w-4 h-4" /> Lock for Payroll
          </Button>
        )}
        {canBulkApprove && canApprove && (
          <Button onClick={bulkApprove} disabled={!!actionLoading} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            {actionLoading === 'bulk-approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Approve Selected ({selected.size})
          </Button>
        )}
        {canBulkLock && canLock && (
          <Button onClick={() => { setLockScope({ type: 'employees', employeeIds: Array.from(selected) }); setLockOpen(true); }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Lock className="w-4 h-4" /> Lock Selected ({selected.size})
          </Button>
        )}
        {canBulkUnlock && canUnlock && (
          <Button onClick={() => setUnlockOpen(true)} variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50">
            <Unlock className="w-4 h-4" /> Unlock Selected ({selected.size})
          </Button>
        )}
        <Button variant="outline" onClick={exportCsv} className="gap-2 ml-auto">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder="Search employee or code…" className="border border-border rounded-lg px-2.5 py-1.5 text-xs w-48" />
        <select value={filters.branch_id} onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))} className="border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filters.department_id} onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))} className="border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filters.leave_type} onChange={(e) => setFilters((f) => ({ ...f, leave_type: e.target.value }))} className="border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Leave Types</option>
          {leaveTypes.map((lt) => <option key={lt.id} value={lt.code ?? lt.name}>{lt.name}</option>)}
        </select>
        <select value={filters.attendance_state} onChange={(e) => setFilters((f) => ({ ...f, attendance_state: e.target.value }))} className="border border-border rounded-lg px-2.5 py-1.5 text-xs">
          <option value="">All Attendance States</option>
          {['present', 'late', 'half_day', 'absent', 'holiday', 'weekly_off', 'paid_leave', 'unpaid_leave'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading summaries…
            </div>
          ) : summaries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No summaries yet. Click &quot;Compute / Refresh&quot; to generate.</div>
          ) : (
            <>
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <SortHead k="employee">Employee</SortHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Department</TableHead>
                    <SortHead k="business_working_days" className="text-right">Biz. Days</SortHead>
                    <SortHead k="present_days" className="text-right">Present</SortHead>
                    <TableHead className="text-right">Paid Leave</TableHead>
                    <TableHead className="text-right">Unpaid Leave</TableHead>
                    <TableHead className="text-right">Holiday</TableHead>
                    <TableHead className="text-right">Weekly Off</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Half Day</TableHead>
                    <TableHead className="text-right">Appr. OT Hrs</TableHead>
                    <SortHead k="payable_days" className="text-right">Payable Days</SortHead>
                    <SortHead k="status">Status</SortHead>
                    <TableHead className="text-right">Ver.</TableHead>
                    <TableHead>Last Generated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((s) => {
                    const locked = ['payroll_locked', 'payroll_processed'].includes(s.status);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          {!locked && (
                            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                          )}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{s.first_name} {s.last_name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.employee_code}</TableCell>
                        <TableCell className="text-muted-foreground">{s.branch_name ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{s.department_name ?? '—'}</TableCell>
                        <TableCell className="text-right">{s.business_working_days}</TableCell>
                        <TableCell className="text-right text-green-700 font-medium">{s.present_days}</TableCell>
                        <TableCell className="text-right text-blue-700">{s.paid_leave_days}</TableCell>
                        <TableCell className="text-right text-orange-700">{s.unpaid_leave_days}</TableCell>
                        <TableCell className="text-right text-violet-700">{s.holiday_days}</TableCell>
                        <TableCell className="text-right text-slate-500">{s.weekly_off_days}</TableCell>
                        <TableCell className="text-right text-red-600">{s.absent_days}</TableCell>
                        <TableCell className="text-right text-yellow-700">{s.late_count}</TableCell>
                        <TableCell className="text-right">{s.half_day_count}</TableCell>
                        <TableCell className="text-right">{parseFloat(s.approved_ot_hours ?? 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-semibold">{parseFloat(s.payable_days ?? 0).toFixed(1)}</TableCell>
                        <TableCell><SummaryStatusBadge status={s.status} /></TableCell>
                        <TableCell className="text-right text-muted-foreground">v{s.generation_version}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{s.generated_at ? new Date(s.generated_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {s.status === 'pending_review' && canApprove && (
                              <>
                                <button onClick={() => approve(s.id)} disabled={!!actionLoading} title="Approve" className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-40">
                                  {actionLoading === `approve-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setRejectTarget(s)} title="Reject" className="p-1.5 rounded hover:bg-red-50 text-red-500">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setCorrectionTarget(s)} title="Request Correction" className="p-1.5 rounded hover:bg-amber-50 text-amber-600">
                                  <ClipboardEdit className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {s.status === 'rejected' && canApprove && (
                              <button onClick={() => setCorrectionTarget(s)} title="Request Correction" className="p-1.5 rounded hover:bg-amber-50 text-amber-600">
                                <ClipboardEdit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!locked && canCompute && (
                              <button onClick={() => recompute(s.id)} disabled={!!actionLoading} title="Recompute" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 disabled:opacity-40">
                                {actionLoading === `recompute-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button onClick={() => setVersionTarget(s.id)} title="Version History" className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                              <History className="w-3.5 h-3.5" />
                            </button>
                            {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground ml-1" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
                  <span>Page {page} of {totalPages} ({sortedSummaries.length} total)</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Workflow: Compute → Pending Review → Approve/Reject/Request Correction → Lock for Payroll → Generate Payslips → Payroll Processed
      </p>
    </div>
  );
}

// ── Inline reason field used inside the Lock dialog (shares the scope picker dialog) ─

function ReasonInline({ onSubmit, loading }: { onSubmit: (reason: string) => void; loading: boolean }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  return (
    <div className="space-y-2">
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Lock reason (required)…"
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      {touched && !reason.trim() && <p className="text-xs text-red-600">A lock reason is required</p>}
      <DialogFooter>
        <Button onClick={() => { setTouched(true); if (reason.trim()) onSubmit(reason.trim()); }} disabled={loading} className="gap-2 bg-blue-600 hover:bg-blue-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Lock
        </Button>
      </DialogFooter>
    </div>
  );
}
