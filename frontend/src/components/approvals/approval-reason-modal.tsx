'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ApprovalReasonModalProps {
  isOpen: boolean;
  action: 'approve' | 'reject' | 'cancel';
  requestTitle: string;
  onConfirm: (reason: string, remarks?: string) => Promise<void>;
  onClose: () => void;
}

const CONFIG = {
  approve: {
    title: 'Approve Request',
    reasonLabel: 'Approval Reason',
    reasonPlaceholder: 'Explain why this request is being approved…',
    remarksLabel: 'Additional Remarks (optional)',
    remarksPlaceholder: 'Any additional notes or conditions…',
    confirmLabel: 'Approve',
    icon: CheckCircle,
    iconClass: 'text-emerald-500',
    confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  reject: {
    title: 'Reject Request',
    reasonLabel: 'Rejection Reason',
    reasonPlaceholder: 'Explain why this request is being rejected…',
    remarksLabel: null,
    remarksPlaceholder: null,
    confirmLabel: 'Reject',
    icon: XCircle,
    iconClass: 'text-red-500',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  cancel: {
    title: 'Cancel Request',
    reasonLabel: 'Cancellation Reason',
    reasonPlaceholder: 'Explain why this request is being cancelled…',
    remarksLabel: null,
    remarksPlaceholder: null,
    confirmLabel: 'Cancel Request',
    icon: AlertCircle,
    iconClass: 'text-amber-500',
    confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
} as const;

const MIN_CHARS = 5;

export function ApprovalReasonModal({
  isOpen, action, requestTitle, onConfirm, onClose,
}: ApprovalReasonModalProps) {
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = CONFIG[action];
  const Icon = cfg.icon;
  const isValid = reason.trim().length >= MIN_CHARS;

  const handleConfirm = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), remarks.trim() || undefined);
      setReason('');
      setRemarks('');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setReason('');
    setRemarks('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${cfg.iconClass}`} />
            <DialogTitle>{cfg.title}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-500 mt-1 line-clamp-2">
            {requestTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {cfg.reasonLabel} <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent disabled:opacity-50"
              rows={4}
              placeholder={cfg.reasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
            />
            <div className="flex justify-between mt-1">
              {!isValid && reason.length > 0 && (
                <p className="text-xs text-red-500">Minimum {MIN_CHARS} characters required</p>
              )}
              <p className={`text-xs ml-auto ${reason.length < MIN_CHARS ? 'text-slate-400' : 'text-slate-500'}`}>
                {reason.length} chars
              </p>
            </div>
          </div>

          {cfg.remarksLabel && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {cfg.remarksLabel}
              </label>
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent disabled:opacity-50"
                rows={2}
                placeholder={cfg.remarksPlaceholder ?? ''}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || loading}
            className={`px-4 py-2 text-sm rounded-md font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${cfg.confirmClass}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {cfg.confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
