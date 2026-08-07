'use client';

import { useState, useEffect, type ReactNode } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ShieldCheck, MapPin, Briefcase, Download } from 'lucide-react';
import { UserTypeBadge } from '@/components/users/user-type-badge';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export default function AuditLogsPage() {
  const canExport = useCan(PERMISSIONS.PLATFORM_AUDIT_VIEW);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (filterEntity) params.entity_type = filterEntity;
      if (filterAction) params.action = filterAction;
      const { data } = await api.get('/audit-logs', { params });
      setLogs(data.data);
      setMeta(data.meta);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction]);

  const actionColors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    LOGIN: 'bg-purple-100 text-purple-800',
    LOGOUT: 'bg-gray-100 text-gray-800',
    user_type_assigned: 'bg-orange-100 text-orange-800',
    scope_updated: 'bg-sky-100 text-sky-800',
    position_assigned: 'bg-emerald-100 text-emerald-800',
  };

  const actionLabels: Record<string, string> = {
    user_type_assigned: 'User Type Assigned',
    scope_updated: 'Scope Updated',
    position_assigned: 'Position Assigned',
  };

  const actionIcons: Record<string, typeof ShieldCheck> = {
    user_type_assigned: ShieldCheck,
    scope_updated: MapPin,
    position_assigned: Briefcase,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">Track all system activities and changes</p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <ExportButton
              config={{
                module: 'audit_logs',
                title: 'Audit Logs',
                permission: PERMISSIONS.PLATFORM_AUDIT_VIEW,
                columns: [
                  { key: 'action', header: 'Action' },
                  { key: 'resource_type', header: 'Resource' },
                  { key: 'resource_id', header: 'Resource ID' },
                  { key: 'actor_name', header: 'Actor' },
                  { key: 'actor_email', header: 'Actor Email' },
                  { key: 'ip_address', header: 'IP Address' },
                  { key: 'created_at', header: 'Timestamp', type: 'date' },
                ],
                defaultColumns: ['action', 'resource_type', 'actor_name', 'created_at', 'ip_address'],
                filenamePrefix: 'audit_logs',
              }}
              filters={{ resource_type: filterEntity, action: filterAction }}
              currentPageData={logs}
              totalRecords={meta?.total}
            />
            <ImportButton
              config={{
                module: 'audit_logs',
                title: 'Audit Logs',
                permission: PERMISSIONS.PLATFORM_AUDIT_VIEW,
              }}
            />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <select value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setPage(1); }} className="border rounded-md px-3 py-2 text-sm">
              <option value="">All Entities</option>
              <option value="employee">Employee</option>
              <option value="user">User</option>
              <option value="role">Role</option>
              <option value="tenant">Tenant</option>
              <option value="property">Property</option>
              <option value="department">Department</option>
              <option value="attendance">Attendance</option>
              <option value="leave">Leave</option>
              <option value="expense">Expense</option>
              <option value="user_access">User Access</option>
              <option value="organization">Organization (Operations)</option>
            </select>
            <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1); }} className="border rounded-md px-3 py-2 text-sm">
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="user_type_assigned">User Type Assigned</option>
              <option value="scope_updated">Scope Updated</option>
              <option value="position_assigned">Position Assigned</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No audit logs found</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left p-4 font-medium">Timestamp</TableHead>
                  <TableHead className="text-left p-4 font-medium">User</TableHead>
                  <TableHead className="text-left p-4 font-medium">Entity</TableHead>
                  <TableHead className="text-left p-4 font-medium">Action</TableHead>
                  <TableHead className="text-left p-4 font-medium">Details</TableHead>
                  <TableHead className="text-left p-4 font-medium">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const ActionIcon = actionIcons[log.action];
                  return (
                  <TableRow key={log.id} className="border-t hover:bg-muted/30">
                    <TableCell className="p-4">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell className="p-4">{log.user_email || log.user_name || 'System'}</TableCell>
                    <TableCell className="p-4">
                      <span className="capitalize">{log.entity_type?.replace(/_/g, ' ') || '—'}</span>
                      {log.entity_id && <span className="text-xs text-muted-foreground ml-1 font-mono">{String(log.entity_id).slice(0, 8)}…</span>}
                    </TableCell>
                    <TableCell className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${actionColors[log.action] || 'bg-gray-100'}`}>
                        {ActionIcon && <ActionIcon className="w-3 h-3" />}
                        {actionLabels[log.action] || log.action}
                      </span>
                    </TableCell>
                    <TableCell className="p-4">
                      {log.entity_type === 'user_access' ? <UserAccessDetails log={log} /> : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="p-4 font-mono text-xs">{log.ip_address || '-'}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {meta.total} logs</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded text-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span className="px-3 py-1 text-sm">Page {meta.page} of {meta.total_pages}</span>
            <button className="px-3 py-1 border rounded text-sm" disabled={page === meta.total_pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserAccessDetails({ log }: { log: any }) {
  const nv = log.new_values || {};
  const parts: ReactNode[] = [];

  if (nv.userType) {
    parts.push(<UserTypeBadge key="type" userType={nv.userType} />);
  }
  if (nv.branchIds?.length) {
    parts.push(
      <span key="branches" className="text-xs text-muted-foreground">
        {nv.branchIds.length} branch{nv.branchIds.length !== 1 ? 'es' : ''}
      </span>,
    );
  }
  if (nv.positionId !== undefined) {
    parts.push(
      <span key="position" className="text-xs text-muted-foreground">
        {nv.positionId ? 'Position assigned' : 'Position cleared'}
      </span>,
    );
  }

  if (!parts.length) return <span className="text-sm text-muted-foreground">—</span>;
  return <div className="flex flex-wrap items-center gap-1.5">{parts}</div>;
}
