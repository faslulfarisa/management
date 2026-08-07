'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getHistoricalImportCapability,
  listHistoricalImportJobs,
  updateHistoricalImportCapability,
  type HistoricalImportBatch,
} from '@/lib/historical-attendance-import-api';
import { cn } from '@/lib/utils';

function StatusPill({ status }: { status: string }) {
  const classes =
    status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'failed' ? 'bg-red-50 text-red-700 border-red-200'
    : status === 'cancelled' ? 'bg-slate-100 text-slate-600 border-slate-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

  return <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold capitalize', classes)}>{status}</span>;
}

export default function OperationsHistoricalAttendanceImportPage() {
  const [jobs, setJobs] = useState<HistoricalImportBatch[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshJobs = async () => {
    setLoading(true);
    try {
      setJobs(await listHistoricalImportJobs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshJobs();
  }, []);

  const loadCapability = async () => {
    if (!tenantId.trim()) return;
    setMessage(null);
    const capability = await getHistoricalImportCapability(tenantId.trim());
    setEnabled(capability.historical_attendance_import_enabled);
  };

  const toggleCapability = async (nextEnabled: boolean) => {
    if (!tenantId.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateHistoricalImportCapability(tenantId.trim(), nextEnabled);
      setEnabled(updated.historical_attendance_import_enabled);
      setMessage(nextEnabled ? 'Capability enabled' : 'Capability disabled');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historical Attendance Imports</h1>
          <p className="mt-1 text-sm text-slate-500">Platform controls and sanitized job monitoring</p>
        </div>
        <Button onClick={refreshJobs} variant="outline" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Organization Capability</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <Input value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="Organization ID" />
          <Button variant="outline" onClick={loadCapability} disabled={!tenantId.trim()}>
            Check
          </Button>
          <Button onClick={() => toggleCapability(true)} disabled={saving || !tenantId.trim()} className="gap-2">
            {saving && enabled === false ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Enable
          </Button>
          <Button variant="outline" onClick={() => toggleCapability(false)} disabled={saving || !tenantId.trim()} className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Disable
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          {enabled !== null && (
            <span className={cn('rounded-full px-3 py-1 text-xs font-bold', enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
          {message && <span className="text-slate-500">{message}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Import Jobs</h2>
        </div>
        <Table containerClassName="max-h-[65vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Date Range</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Warnings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-slate-400">No import jobs</TableCell>
              </TableRow>
            ) : jobs.map((job: any) => (
              <TableRow key={job.id}>
                <TableCell>
                  <p className="font-medium text-slate-900">{job.organization_name}</p>
                  <p className="text-xs text-slate-400">{job.organization_slug}</p>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600">{job.id.slice(0, 8)}</TableCell>
                <TableCell>
                  <p className="text-slate-700">{job.source_name || 'Source removed'}</p>
                  <p className="text-xs text-slate-400">{job.source_type}</p>
                </TableCell>
                <TableCell className="text-slate-600">{job.date_from} to {job.date_to}</TableCell>
                <TableCell><StatusPill status={job.status} /></TableCell>
                <TableCell>{Number(job.progress_percent ?? 0)}%</TableCell>
                <TableCell>{job.failed_records ?? 0}</TableCell>
                <TableCell>{job.warning_count ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
