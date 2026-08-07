'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { exitApi } from '@/lib/exit-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { ExitStatusBadge } from '@/components/exit-management/exit-status-badge';
import { ExitDetailDialog } from '@/components/exit-management/exit-detail-dialog';
import { ExitNewRequestDialog } from '@/components/exit-management/exit-new-request-dialog';
import type { ExitRequest, ExitStats } from '@/types/exit';
import { EXIT_REQUEST_TYPE_LABELS } from '@/types/exit';

const STAT_CARDS: Array<{ key: keyof ExitStats; label: string }> = [
  { key: 'pending_requests', label: 'Pending Requests' },
  { key: 'approvals_pending', label: 'Approvals Pending' },
  { key: 'notice_period', label: 'Notice Period' },
  { key: 'clearances_pending', label: 'Clearances Pending' },
  { key: 'assets_pending', label: 'Assets Pending' },
  { key: 'fnf_pending', label: 'FnF Pending' },
  { key: 'interviews_pending', label: 'Interviews Pending' },
  { key: 'completed_exits', label: 'Completed Exits' },
];

export default function ExitManagementPage() {
  const [stats, setStats] = useState<ExitStats | null>(null);
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);

  const canCreate = useCan(PERMISSIONS.EXIT_CREATE);
  const canDelete = useCan(PERMISSIONS.EXIT_DELETE);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, requestsData, employeesRes] = await Promise.all([
        exitApi.getStats(),
        exitApi.listRequests({ status: statusFilter || undefined, search: search || undefined }),
        api.get('/employees', { params: { limit: 200 } }),
      ]);
      setStats(statsData);
      setRequests(requestsData);
      setEmployees(employeesRes.data.data ?? []);
    } catch (err) {
      console.error('Failed to load exit management data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this exit request?')) return;
    try {
      await exitApi.deleteRequest(id);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exit Management</h1>
          <p className="text-muted-foreground">Complete employee offboarding — approvals, notice period, clearances, assets, and Full &amp; Final settlement</p>
        </div>
        {canCreate && <Button onClick={() => setShowNewRequest(true)}>+ New Exit Request</Button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label }) => (
          <Card key={key}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{stats ? stats[key] : '—'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Search by name or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              <option value="">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="notice_period">Notice Period</option>
              <option value="clearance_in_progress">Clearance In Progress</option>
              <option value="pending_settlement">Pending Settlement</option>
              <option value="settled">Settled</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            <span className="text-sm text-muted-foreground ml-auto">{requests.length} request(s)</span>
          </div>

          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No exit requests found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead pinned>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Last Working Day</TableHead>
                  <TableHead>Notice (days)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell pinned className="font-medium">{r.first_name} {r.last_name} <span className="text-muted-foreground text-xs">({r.employee_code})</span></TableCell>
                    <TableCell>{EXIT_REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}</TableCell>
                    <TableCell>{new Date(r.requested_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(r.last_working_date).toLocaleDateString()}</TableCell>
                    <TableCell>{r.notice_period_days}</TableCell>
                    <TableCell><ExitStatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)}>View</Button>
                        {canDelete && ['draft', 'rejected', 'withdrawn', 'cancelled'].includes(r.status) && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(r.id)}>Delete</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExitDetailDialog id={selectedId} onClose={() => setSelectedId(null)} onChanged={fetchData} />
      <ExitNewRequestDialog open={showNewRequest} employees={employees} onClose={() => setShowNewRequest(false)} onCreated={fetchData} />
    </div>
  );
}
