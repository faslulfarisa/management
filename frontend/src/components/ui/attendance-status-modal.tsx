'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { Loader2, X, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface AttendanceStatus {
  code: string;
  label: string;
  emoji: string;
  clockIn?: string;
  clockOut?: string;
  lateMinutes?: number;
}

interface Props {
  employee: { id: string; first_name: string; last_name: string; employee_code: string };
  orgId?: string;
  onClose: () => void;
}

function fmtTime(t?: string) {
  if (!t) return null;
  return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function AttendanceStatusModal({ employee, orgId, onClose }: Props) {
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = orgId
        ? `/platform/orgs/${orgId}/employees/${employee.id}/attendance-status`
        : `/employees/${employee.id}/attendance-status`;
      const r = await api.get(url);
      setStatus(r.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch attendance status');
    } finally {
      setLoading(false);
    }
  }, [employee.id, orgId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-bold">Attendance Status</h2>
            <p className="text-xs text-muted-foreground">{employee.first_name} {employee.last_name} · {employee.employee_code}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Checking…</span>
            </div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-red-600">{error}</div>
          ) : status ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">{status.emoji}</div>
              <p className="text-lg font-semibold text-gray-900">{status.label}</p>
              {status.clockIn && (
                <p className="text-xs text-muted-foreground mt-2">Clock In: {fmtTime(status.clockIn)}</p>
              )}
              {status.clockOut && (
                <p className="text-xs text-muted-foreground">Clock Out: {fmtTime(status.clockOut)}</p>
              )}
              {status.lateMinutes != null && status.lateMinutes > 0 && (
                <p className="text-xs text-orange-600 mt-1">{status.lateMinutes} min late</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
