'use client';

import { useState } from 'react';
import {
  Coffee, Utensils, Sparkles, User, Briefcase, AlertCircle, LogOut, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PUNCH_OUT_REASONS, type PunchOutReason } from '@/lib/punch-out-reasons';
import { cn } from '@/lib/utils';

const REASON_ICONS: Record<string, LucideIcon> = {
  tea_break: Coffee,
  lunch_break: Utensils,
  prayer_break: Sparkles,
  personal_break: User,
  official_outside: Briefcase,
  emergency_leave: AlertCircle,
  end_of_shift: LogOut,
  other: MoreHorizontal,
};

interface PunchOutReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonCode: string, note?: string) => void;
  isSubmitting?: boolean;
}

export function PunchOutReasonModal({ open, onOpenChange, onConfirm, isSubmitting }: PunchOutReasonModalProps) {
  const [selected, setSelected] = useState<PunchOutReason | null>(null);
  const [note, setNote] = useState('');

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected.code, note.trim() || undefined);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(null);
      setNote('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Why are you punching out?</DialogTitle>
          <DialogDescription>
            Select a reason.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {PUNCH_OUT_REASONS.map((reason) => {
            const Icon = REASON_ICONS[reason.code] ?? MoreHorizontal;
            const isSelected = selected?.code === reason.code;
            return (
              <button
                key={reason.code}
                type="button"
                onClick={() => setSelected(reason)}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-3 text-left text-sm font-medium transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{reason.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label htmlFor="punch-out-note" className="mb-1 block text-xs font-medium text-muted-foreground">
            Note {selected?.code === 'other' ? '(required)' : '(optional)'}
          </label>
          <textarea
            id="punch-out-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add any additional details..."
            className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || isSubmitting || (selected.code === 'other' && !note.trim())}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Punching out...' : 'Confirm'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
