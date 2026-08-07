'use client';

import { CheckCircle2, HelpCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RecruitmentStep {
  label: string;
  description: string;
  status: 'complete' | 'current' | 'pending';
}

export function RecruitmentStepIndicator({ steps }: { steps: RecruitmentStep[] }) {
  const completed = steps.filter((step) => step.status === 'complete').length;
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Hiring journey</p>
          <p className="text-xs text-muted-foreground">Follow the next highlighted step to keep candidates moving.</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-primary">{progress}% complete</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.label}
            title={step.description}
            className={cn(
              'rounded-lg border px-3 py-2',
              step.status === 'complete' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              step.status === 'current' && 'border-primary/40 bg-primary/5 text-foreground ring-1 ring-primary/20',
              step.status === 'pending' && 'border-border bg-muted/20 text-muted-foreground',
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                step.status === 'complete' ? 'bg-emerald-600 text-white' : step.status === 'current' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
              )}>
                {step.status === 'complete' ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <p className="truncate text-xs font-semibold">{step.label}</p>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] opacity-80">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextualHelp({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <div className="mt-0.5 text-blue-700">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GuidedEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center">
      <Search className="mx-auto h-7 w-7 text-muted-foreground" />
      <h3 className="mt-3 text-base font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function QuickFilterButton({
  active,
  label,
  count,
  onClick,
  title,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/20' : 'bg-muted')}>{count}</span>}
    </button>
  );
}

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <span className="text-sm font-semibold text-foreground">{count} selected</span>
      {children}
      <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" /> Clear
      </button>
    </div>
  );
}

export function AutoSaveNote({ savedAt }: { savedAt: string | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      {savedAt ? `Draft auto-saved at ${savedAt}` : 'Draft auto-save is ready'}
    </p>
  );
}
