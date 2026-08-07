'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

export function VacancyActionDialog({
  title, description, reasonLabel = 'Reason', reasonRequired, confirmLabel, confirmClassName,
  onConfirm, onClose,
}: {
  title: string;
  description?: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmLabel: string;
  confirmClassName?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (reasonRequired && reason.trim().length < 5) {
      setError('Reason must be at least 5 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Action failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {reasonLabel} {reasonRequired && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            onClick={confirm}
            disabled={submitting}
            className={confirmClassName || 'bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50'}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
