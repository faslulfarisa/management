import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 animate-pulse', className)}>
      <div className="h-4 w-2/5 rounded bg-muted mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn('h-3 rounded bg-muted mb-2', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-3 animate-pulse', className)}>
      <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}
