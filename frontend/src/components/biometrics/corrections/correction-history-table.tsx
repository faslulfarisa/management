'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { correctionsApi } from '@/lib/biometrics-api';
import { StatusBadge } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle, XCircle, RefreshCw, Clock, MessageSquare,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { CorrectionRequest } from '@/types/biometrics';

function statusInfo(status: string): { label: string; badge: 'warn' | 'online' | 'offline' | 'idle' } {
  if (status === 'pending')  return { label: 'Pending',  badge: 'warn'    };
  if (status === 'approved') return { label: 'Approved', badge: 'online'  };
  if (status === 'rejected') return { label: 'Rejected', badge: 'offline' };
  return { label: status, badge: 'idle' };
}

function RejectModal({
  correctionId,
  onConfirm,
  onCancel,
}: {
  correctionId: string;
  onConfirm: (id: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="ops-panel w-full max-w-md p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Reject Correction</h3>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Rejection notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Explain the reason for rejection…"
            className="w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-400 resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 ops-surface rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(correctionId, notes)}
            className="px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function CorrectionCard({ correction }: { correction: CorrectionRequest }) {
  const { label, badge } = statusInfo(correction.status);
  const qc = useQueryClient();

  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const approveMut = useMutation({
    mutationFn: () => correctionsApi.approve(correction.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biometrics', 'corrections'] }),
  });
  const rejectMut = useMutation({
    mutationFn: (notes: string) => correctionsApi.reject(correction.id, notes),
    onSuccess: () => {
      setRejectModalOpen(false);
      qc.invalidateQueries({ queryKey: ['biometrics', 'corrections'] });
    },
  });

  return (
    <>
      {rejectModalOpen && (
        <RejectModal
          correctionId={correction.id}
          onConfirm={(_, notes) => rejectMut.mutate(notes)}
          onCancel={() => setRejectModalOpen(false)}
        />
      )}

      <div className="ops-panel p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge label={label} status={badge} />
            <span className="text-[10px] text-slate-500 capitalize border border-slate-200 px-2 py-0.5 rounded">
              {correction.correctionType.replace(/_/g, ' ')}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 shrink-0">
            {formatDistanceToNowStrict(new Date(correction.createdAt), { addSuffix: true })}
          </span>
        </div>

        {/* Record ID */}
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Attendance Record</p>
          <p className="font-mono text-xs text-slate-600 truncate">{correction.attendanceRecordId}</p>
        </div>

        {/* Time changes */}
        {(correction.requestedClockIn || correction.requestedClockOut) && (
          <div className="ops-surface p-2.5 space-y-1.5 rounded">
            {correction.requestedClockIn && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="text-slate-500">Clock In →</span>
                <span className="text-slate-800 font-mono">
                  {format(new Date(correction.requestedClockIn), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}
            {correction.requestedClockOut && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-red-500 shrink-0" />
                <span className="text-slate-500">Clock Out →</span>
                <span className="text-slate-800 font-mono">
                  {format(new Date(correction.requestedClockOut), 'MMM d, yyyy HH:mm')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="flex items-start gap-1.5">
          <MessageSquare className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 italic">{correction.reason}</p>
        </div>

        {/* Review notes */}
        {correction.reviewNotes && (
          <div className="flex items-start gap-1.5 text-[10px] text-slate-500">
            <span className="shrink-0">Notes:</span>
            <span className="italic">{correction.reviewNotes}</span>
          </div>
        )}

        {/* Actions */}
        {correction.status === 'pending' && (
          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <button
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending || rejectMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle className={cn('w-3 h-3', approveMut.isPending && 'animate-spin')} />
              Approve
            </button>
            <button
              onClick={() => setRejectModalOpen(true)}
              disabled={approveMut.isPending || rejectMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" />
              Reject
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function CorrectionHistoryTable() {
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['biometrics', 'corrections', page],
    queryFn: () => correctionsApi.listPending(page, 20),
    staleTime: 15_000,
  });

  const corrections = data?.items ?? (Array.isArray(data) ? data as CorrectionRequest[] : []);
  const total = data?.total ?? corrections.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {total} pending correction{total !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="ops-panel h-40 animate-pulse" />
          ))}
        </div>
      ) : corrections.length === 0 ? (
        <div className="ops-panel flex flex-col items-center justify-center py-16 gap-2">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
          <p className="text-sm text-slate-600">No pending corrections</p>
          <p className="text-xs text-slate-400">All caught up</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {corrections.map((c) => (
            <CorrectionCard key={c.id} correction={c} />
          ))}
        </div>
      )}
    </div>
  );
}
