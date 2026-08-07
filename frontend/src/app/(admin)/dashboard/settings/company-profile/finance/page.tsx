'use client';

import { useState, useEffect, useCallback } from 'react';
import { bankAccountsApi } from '@/lib/company-profile-api';
import type { BankAccount, CreateBankAccountPayload } from '@/lib/company-profile-api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, RefreshCw, Star, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCOUNT_TYPES = ['savings', 'current', 'overdraft', 'cash_credit'];

const EMPTY_FORM: CreateBankAccountPayload = {
  accountLabel:      '',
  accountHolderName: '',
  bankName:          '',
  accountNumber:     '',
  ifscCode:          '',
  accountType:       'current',
  upiId:             '',
  isPrimary:         false,
  useForInvoices:    false,
  useForPayroll:     false,
};

export default function FinancePage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [drawer,   setDrawer]   = useState<'add' | BankAccount | null>(null);

  const load = useCallback(() => {
    bankAccountsApi.list().then(setAccounts).catch(() => setError('Failed to load accounts.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this bank account?')) return;
    try {
      await bankAccountsApi.remove(id);
      load();
    } catch {
      setError('Delete failed.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Bank Accounts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Account numbers are stored encrypted and displayed masked.</p>
        </div>
        <Button onClick={() => setDrawer('add')} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No bank accounts added yet</p>
            <p className="text-xs text-muted-foreground">Add your company bank account to use on invoices and payroll.</p>
            <Button size="sm" onClick={() => setDrawer('add')}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className={cn(acc.is_primary && 'ring-1 ring-primary')}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">
                      {acc.account_label || acc.bank_name || 'Bank Account'}
                    </p>
                    {acc.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        <Star className="h-2.5 w-2.5" /> Primary
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {acc.bank_name && <span>{acc.bank_name} · </span>}
                    {acc.account_last4 ? (
                      <span className="font-mono">•••• {acc.account_last4}</span>
                    ) : (
                      <span>No account number</span>
                    )}
                    {acc.ifsc_code && <span> · {acc.ifsc_code}</span>}
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    {acc.use_for_invoices && <Badge>Invoices</Badge>}
                    {acc.use_for_payroll  && <Badge>Payroll</Badge>}
                    {acc.account_type && (
                      <Badge variant="outline">{acc.account_type}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setDrawer(acc)} className="h-8 w-8 p-0">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(acc.id)} className="h-8 w-8 p-0 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {drawer !== null && (
        <AccountDrawer
          account={drawer === 'add' ? null : drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); load(); }}
        />
      )}
    </div>
  );
}

function AccountDrawer({
  account,
  onClose,
  onSaved,
}: {
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = account !== null;

  const [form, setForm] = useState<CreateBankAccountPayload>(
    isEdit
      ? {
          accountLabel:      account.account_label      ?? '',
          accountHolderName: account.account_holder_name ?? '',
          bankName:          account.bank_name           ?? '',
          accountNumber:     '',
          ifscCode:          account.ifsc_code           ?? '',
          accountType:       account.account_type        ?? 'current',
          upiId:             account.upi_id              ?? '',
          isPrimary:         account.is_primary,
          useForInvoices:    account.use_for_invoices,
          useForPayroll:     account.use_for_payroll,
        }
      : { ...EMPTY_FORM },
  );

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (key: keyof CreateBankAccountPayload, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await bankAccountsApi.update(account.id, form);
      } else {
        await bankAccountsApi.create(form);
      }
      onSaved();
    } catch {
      setError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-background shadow-2xl flex flex-col overflow-hidden border-l border-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit Account' : 'Add Bank Account'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Field label="Account Label">
            <Input value={form.accountLabel ?? ''} onChange={(e) => set('accountLabel', e.target.value)} placeholder="e.g. Main Current Account" />
          </Field>
          <Field label="Account Holder Name">
            <Input value={form.accountHolderName ?? ''} onChange={(e) => set('accountHolderName', e.target.value)} placeholder="Acme Corp" />
          </Field>
          <Field label="Bank Name">
            <Input value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} placeholder="HDFC Bank" />
          </Field>
          <Field label={isEdit ? 'Account Number (leave blank to keep unchanged)' : 'Account Number'}>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.accountNumber ?? ''}
              onChange={(e) => set('accountNumber', e.target.value)}
              placeholder={isEdit ? '•••••••••• (unchanged)' : 'Enter account number'}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="IFSC Code">
              <Input value={form.ifscCode ?? ''} onChange={(e) => set('ifscCode', e.target.value.toUpperCase())} placeholder="HDFC0000001" />
            </Field>
            <Field label="Account Type">
              <select
                value={form.accountType ?? 'current'}
                onChange={(e) => set('accountType', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="UPI ID (optional)">
            <Input value={form.upiId ?? ''} onChange={(e) => set('upiId', e.target.value)} placeholder="acme@hdfcbank" />
          </Field>

          <div className="space-y-3 pt-1">
            <Checkbox
              id="isPrimary"
              label="Set as primary account"
              checked={form.isPrimary ?? false}
              onChange={(v) => set('isPrimary', v)}
            />
            <Checkbox
              id="useForInvoices"
              label="Use for invoices"
              checked={form.useForInvoices ?? false}
              onChange={(v) => set('useForInvoices', v)}
            />
            <Checkbox
              id="useForPayroll"
              label="Use for payroll payouts"
              checked={form.useForPayroll ?? false}
              onChange={(v) => set('useForPayroll', v)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Checkbox({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border" />
      <label htmlFor={id} className="text-sm">{label}</label>
    </div>
  );
}

function Badge({ children, variant = 'filled' }: { children: React.ReactNode; variant?: 'filled' | 'outline' }) {
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize',
      variant === 'filled'
        ? 'bg-primary/10 text-primary'
        : 'border border-border text-muted-foreground',
    )}>
      {children}
    </span>
  );
}
