'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import { Button } from './button';

interface TypedConfirmDialogProps {
  title: string;
  description: React.ReactNode;
  /** The exact string the user must type to enable the confirm action. */
  confirmPhrase: string;
  confirmLabel?: React.ReactNode;
  confirmButtonLabel?: string;
  loadingLabel?: string;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for irreversible, global super-admin actions (e.g.
 * deleting an organization). The destructive action only becomes available
 * once the user types `confirmPhrase` exactly, guarding against accidental
 * clicks on high-blast-radius operations.
 *
 * Renders only while mounted by the caller (e.g. `{target && <TypedConfirmDialog .../>}`)
 * so its typed-input state resets automatically between targets.
 */
export function TypedConfirmDialog({
  title,
  description,
  confirmPhrase,
  confirmLabel,
  confirmButtonLabel = 'Confirm',
  loadingLabel = 'Working…',
  isLoading = false,
  onCancel,
  onConfirm,
}: TypedConfirmDialogProps) {
  const [input, setInput] = useState('');

  const ready = input === confirmPhrase;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-destructive/10 shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm text-muted-foreground mb-4">{description}</div>

        <div className="mb-2">
          <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
            {confirmLabel ?? (
              <>
                Type <span className="font-mono font-bold text-destructive">{confirmPhrase}</span> to confirm
              </>
            )}
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={confirmPhrase}
            autoFocus
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            className="w-full border border-destructive/30 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive/30 bg-destructive/5 placeholder:text-destructive/30 disabled:opacity-60"
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!ready || isLoading}
            className="min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              confirmButtonLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
