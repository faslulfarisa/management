'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ORG_LIFECYCLE_LABELS, type OrgLifecycleStage } from '@/lib/organization-lifecycle';
import type { OpsOrganization } from '@/lib/operations-api';

export interface OrgFormValues {
  name: string;
  slug: string;
  primary_email: string;
  phone_number: string;
  industry: string;
  lifecycleStage: OrgLifecycleStage;
}

const CREATABLE_STAGES: OrgLifecycleStage[] = ['pending_review', 'pending_approval'];

export function OrgFormDialog({
  open,
  onClose,
  onSubmit,
  organization,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: OrgFormValues) => Promise<void>;
  organization?: OpsOrganization | null;
  submitting?: boolean;
}) {
  const isEdit = !!organization;
  const [values, setValues] = useState<OrgFormValues>({
    name: '', slug: '', primary_email: '', phone_number: '', industry: '', lifecycleStage: 'pending_review',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (organization) {
      setValues({
        name: organization.name || '',
        slug: organization.slug || '',
        primary_email: organization.primary_email || '',
        phone_number: organization.phone_number || '',
        industry: organization.industry || '',
        lifecycleStage: organization.lifecycle_stage,
      });
    } else {
      setValues({ name: '', slug: '', primary_email: '', phone_number: '', industry: '', lifecycleStage: 'pending_review' });
    }
    setError('');
  }, [organization, open]);

  const handleSubmit = async () => {
    if (!values.name.trim() || !values.slug.trim()) {
      setError('Name and slug are required');
      return;
    }
    setError('');
    try {
      await onSubmit(values);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.response?.data?.message ?? 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Organization' : 'New Organization'}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Organization Name</label>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="Acme Corp" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Slug</label>
            <Input value={values.slug} onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))} placeholder="acme-corp" disabled={isEdit} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact Email</label>
              <Input type="email" value={values.primary_email} onChange={(e) => setValues((v) => ({ ...v, primary_email: e.target.value }))} placeholder="contact@acme.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <Input value={values.phone_number} onChange={(e) => setValues((v) => ({ ...v, phone_number: e.target.value }))} placeholder="+91…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Industry</label>
            <Input value={values.industry} onChange={(e) => setValues((v) => ({ ...v, industry: e.target.value }))} placeholder="Hospitality" />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Starting Stage</label>
              <select
                value={values.lifecycleStage}
                onChange={(e) => setValues((v) => ({ ...v, lifecycleStage: e.target.value as OrgLifecycleStage }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CREATABLE_STAGES.map((s) => (
                  <option key={s} value={s}>{ORG_LIFECYCLE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
