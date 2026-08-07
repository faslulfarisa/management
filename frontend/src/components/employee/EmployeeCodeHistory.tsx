'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import api from '@/lib/api';
import { History } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface CodeHistoryEntry {
  id: string;
  previous_code: string;
  new_code: string;
  changed_at: string;
  changed_by_first_name?: string;
  changed_by_last_name?: string;
}

/** Audit trail of employee_code changes — Old Code, New Code, Changed By, Date & Time. */
export default function EmployeeCodeHistory({ employeeId }: { employeeId: string }) {
  const [entries, setEntries] = useState<CodeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/employees/${employeeId}/code-history`)
      .then(r => setEntries(r.data.data || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [employeeId]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Employee Code History</h3>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No code changes recorded.</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">Old Code</TableHead>
                <TableHead className="px-3">New Code</TableHead>
                <TableHead className="px-3">Changed By</TableHead>
                <TableHead className="px-3">Date & Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="px-3 py-2 text-muted-foreground">{entry.previous_code}</TableCell>
                  <TableCell className="px-3 py-2 font-medium">{entry.new_code}</TableCell>
                  <TableCell className="px-3 py-2">
                    {entry.changed_by_first_name || entry.changed_by_last_name
                      ? `${entry.changed_by_first_name || ''} ${entry.changed_by_last_name || ''}`.trim()
                      : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2">{format(parseISO(entry.changed_at), 'dd MMM yyyy, HH:mm')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
