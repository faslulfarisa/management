'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Loader2, Plus, Star, Trash2, ShieldCheck, ShieldX, X, Pencil, Building2,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  employee_id: string;
  account_holder_name: string;
  account_number_masked: string;
  ifsc_code: string;
  bank_name: string;
  account_type: string;
  is_primary: boolean;
  verification_status: 'unverified' | 'pending' | 'verified' | 'failed';
  verified_at?: string;
  razorpay_fund_account_id?: string;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  savings: 'Savings',
  current: 'Current',
  salary: 'Salary',
};

const VERIFY_STATUS_COLORS: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

// ── Add / Edit Bank Account Modal ──────────────────────────────────────────────

function BankAccountFormModal({ employeeId, account, onClose, onSaved }: {
  employeeId: string;
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!account;
  const [form, setForm] = useState({
    account_holder_name: account?.account_holder_name ?? '',
    account_number: '',
    ifsc_code: account?.ifsc_code ?? '',
    bank_name: account?.bank_name ?? '',
    account_type: account?.account_type ?? 'savings',
    is_primary: account?.is_primary ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.account_holder_name.trim()) e.account_holder_name = 'Required';
    if (!editing && !form.account_number.trim()) e.account_number = 'Required';
    if (!editing && !/^\d{9,18}$/.test(form.account_number)) e.account_number = 'Must be 9–18 digits';
    if (!form.ifsc_code.trim()) e.ifsc_code = 'Required';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc_code.toUpperCase())) e.ifsc_code = 'Invalid IFSC format (e.g. SBIN0001234)';
    if (!form.bank_name.trim()) e.bank_name = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form, ifsc_code: form.ifsc_code.toUpperCase(), employee_id: employeeId };
      if (editing) {
        const { account_number, ...rest } = payload;
        await api.put(`/payroll/bank-accounts/${account!.id}`, rest);
      } else {
        await api.post('/payroll/bank-accounts', payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err.response?.data?.error || err.response?.data?.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = 'text', required = true) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${(errors as any)[key] ? 'border-red-400' : 'border-border'}`}
      />
      {(errors as any)[key] && <p className="text-xs text-red-500 mt-1">{(errors as any)[key]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Bank Account' : 'Add Bank Account'}</DialogTitle>
          <DialogDescription>Enter the employee&apos;s bank details</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {errors._ && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errors._}</p>}
          {field('account_holder_name', 'Account Holder Name')}
          {!editing && field('account_number', 'Account Number')}
          {editing && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">Account number cannot be changed. Delete and re-add if needed.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {field('ifsc_code', 'IFSC Code')}
            {field('bank_name', 'Bank Name')}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Account Type <span className="text-red-500">*</span></label>
            <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="rounded" />
            <span className="text-sm">Set as primary account</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editing ? 'Save Changes' : 'Add Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Verify Bank Account Modal ──────────────────────────────────────────────────

function VerifyModal({ account, onClose, onSaved }: {
  account: BankAccount; onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState<'verified' | 'failed'>('verified');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/payroll/bank-accounts/${account.id}/verify`, { status, notes: notes.trim() || undefined });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update verification');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Verify Bank Account</DialogTitle>
          <DialogDescription>{account.bank_name} ···· {account.account_number_masked?.slice(-4)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer flex-1 border rounded-xl p-3 has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
              <input type="radio" name="vstatus" value="verified" checked={status === 'verified'} onChange={() => setStatus('verified')} />
              <span className="text-sm font-medium text-green-700">Verified</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer flex-1 border rounded-xl p-3 has-[:checked]:border-red-400 has-[:checked]:bg-red-50">
              <input type="radio" name="vstatus" value="failed" checked={status === 'failed'} onChange={() => setStatus('failed')} />
              <span className="text-sm font-medium text-red-600">Failed</span>
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Verification notes…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className={`gap-2 ${status === 'verified' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : status === 'verified' ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
            {status === 'verified' ? 'Mark Verified' : 'Mark Failed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Employee Bank Accounts Drawer ──────────────────────────────────────────────

function EmployeeBankDrawer({ employee, onClose }: { employee: any; onClose: () => void }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<BankAccount | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<BankAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [primaryLoading, setPrimaryLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payroll/bank-accounts/employee/${employee.id}`);
      setAccounts(res.data.data ?? res.data ?? []);
    } catch {
      setError('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  }, [employee.id]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const setPrimary = async (id: string) => {
    setPrimaryLoading(id);
    setError('');
    try {
      await api.patch(`/payroll/bank-accounts/${id}/set-primary`);
      await fetchAccounts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to set primary');
    } finally {
      setPrimaryLoading(null);
    }
  };

  const deleteAccount = async (id: string) => {
    setDeleteLoading(id);
    setError('');
    try {
      await api.delete(`/payroll/bank-accounts/${id}`);
      await fetchAccounts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <>
      {showAddModal && <BankAccountFormModal employeeId={employee.id} account={null} onClose={() => setShowAddModal(false)} onSaved={fetchAccounts} />}
      {editTarget && <BankAccountFormModal employeeId={employee.id} account={editTarget} onClose={() => setEditTarget(null)} onSaved={fetchAccounts} />}
      {verifyTarget && <VerifyModal account={verifyTarget} onClose={() => setVerifyTarget(null)} onSaved={fetchAccounts} />}

      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="text-base font-bold">{employee.first_name} {employee.last_name}</h2>
              <p className="text-xs text-muted-foreground">{employee.employee_code} · Bank Accounts</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-10 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No bank accounts added yet</p>
              </div>
            ) : (
              accounts.map(acc => (
                <div key={acc.id} className={`border rounded-xl p-4 space-y-2 ${acc.is_primary ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{acc.bank_name}</span>
                        {acc.is_primary && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <Star className="w-3 h-3" /> Primary
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VERIFY_STATUS_COLORS[acc.verification_status]}`}>
                          {acc.verification_status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{acc.account_number_masked} · {ACCOUNT_TYPE_LABELS[acc.account_type] ?? acc.account_type}</p>
                      <p className="text-xs text-muted-foreground">IFSC: {acc.ifsc_code} · {acc.account_holder_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-1 border-t border-border/60 flex-wrap">
                    {!acc.is_primary && (
                      <button onClick={() => setPrimary(acc.id)} disabled={!!primaryLoading}
                        className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-40">
                        {primaryLoading === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />} Set Primary
                      </button>
                    )}
                    <button onClick={() => setVerifyTarget(acc)}
                      className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <ShieldCheck className="w-3 h-3" /> Verify
                    </button>
                    <button onClick={() => setEditTarget(acc)}
                      className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    {!acc.is_primary && (
                      <button onClick={() => deleteAccount(acc.id)} disabled={!!deleteLoading}
                        className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-40 ml-auto">
                        {deleteLoading === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-border px-5 py-4">
            <Button onClick={() => setShowAddModal(true)} className="w-full gap-2">
              <Plus className="w-4 h-4" /> Add Bank Account
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BankAccountsPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees?limit=1000');
      setEmployees(res.data.data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || `${e.first_name} ${e.last_name} ${e.employee_code}`.toLowerCase().includes(q);
  });

  return (
    <>
      {selectedEmployee && (
        <EmployeeBankDrawer employee={selectedEmployee} onClose={() => { setSelectedEmployee(null); fetchData(); }} />
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-muted">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Bank Accounts</h1>
            <p className="text-muted-foreground">Manage employee bank accounts for payroll payments</p>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="border border-border rounded-xl px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-sm text-muted-foreground">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading employees…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">No employees found</div>
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(emp => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.employee_code}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{emp.department_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.position_name ?? '—'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelectedEmployee(emp)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
