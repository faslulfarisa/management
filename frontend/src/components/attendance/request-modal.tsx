'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from './status-badge';
import { format } from 'date-fns';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

interface AttendanceRequest {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  date: string;
  request_type: 'regularization' | 'correction' | 'leave';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  clock_in?: string | null;
  clock_out?: string | null;
}

interface RequestModalProps {
  request: AttendanceRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, notes: string) => Promise<void>;
  isLoading?: boolean;
}

const typeLabels = {
  regularization: 'Regularization',
  correction: 'Correction',
  leave: 'Leave',
};

export function RequestModal({
  request,
  isOpen,
  onClose,
  onApprove,
  onReject,
  isLoading,
}: RequestModalProps) {
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canApprove = useCan(PERMISSIONS.ATTENDANCE_APPROVE);

  if (!request) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(request.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await onReject(request.id, rejectionNotes);
      setRejectionNotes('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review Attendance Request</DialogTitle>
          <DialogDescription>
            {request.first_name} {request.last_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Request Details */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Request Type</p>
              <p className="font-semibold">
                {typeLabels[request.request_type]}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Date</p>
              <p className="font-semibold">
                {format(new Date(request.date), 'MMM d, yyyy')}
              </p>
            </div>
            {request.clock_in && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Clock In</p>
                <p className="font-semibold">
                  {format(new Date(request.clock_in), 'HH:mm')}
                </p>
              </div>
            )}
            {request.clock_out && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Clock Out</p>
                <p className="font-semibold">
                  {format(new Date(request.clock_out), 'HH:mm')}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-600 mb-1">Reason</p>
              <p className="text-sm">{request.reason}</p>
            </div>
          </div>

          {/* Rejection Notes (only for pending) */}
          {request.status === 'pending' && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Rejection Notes (optional)
              </label>
              <Textarea
                placeholder="Provide reason for rejection..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="h-24"
              />
            </div>
          )}

          {/* Status badge for non-pending */}
          {request.status !== 'pending' && (
            <div className="flex justify-center">
              <StatusBadge
                status={
                  request.status === 'approved' ? 'present' : ('absent' as any)
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          {request.status === 'pending' && canApprove && (
            <>
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isSubmitting}
                className="text-red-600 hover:text-red-700"
              >
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? 'Processing...' : 'Approve'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
