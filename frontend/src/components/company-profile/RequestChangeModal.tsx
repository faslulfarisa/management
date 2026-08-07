'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { organizationChangeRequestApi, CreateChangeRequestPayload } from '@/lib/organization-registration-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export interface ProtectedField {
  key: keyof Omit<CreateChangeRequestPayload, 'reason'>;
  label: string;
  currentValue: string;
}

export function RequestChangeModal({
  fields, open, onClose, onSubmitted,
}: {
  fields: ProtectedField[];
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.currentValue])),
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const changed: Partial<CreateChangeRequestPayload> = {};
    for (const f of fields) {
      if (values[f.key] !== f.currentValue) (changed as any)[f.key] = values[f.key];
    }
    if (!Object.keys(changed).length) {
      setError('Please change at least one value.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Please provide a reason of at least 10 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await organizationChangeRequestApi.create({ ...changed, reason } as CreateChangeRequestPayload);
      onSubmitted();
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Could not submit change request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request a Change</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          These fields are locked after approval. Your request will be reviewed by an administrator before it takes effect.
        </p>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{f.label}</label>
              <Input value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Reason for change *</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain why this change is needed…" />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Request'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
