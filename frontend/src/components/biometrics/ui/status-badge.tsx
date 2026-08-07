import { cn } from '@/lib/utils';

type StatusLevel = 'online' | 'offline' | 'warn' | 'blue' | 'purple' | 'idle';

const CLASS_MAP: Record<StatusLevel, string> = {
  online:  'badge-online',
  offline: 'badge-offline',
  warn:    'badge-warn',
  blue:    'badge-blue',
  purple:  'badge-purple',
  idle:    'bg-slate-100 text-slate-500 border border-slate-200',
};

interface StatusBadgeProps {
  label: string;
  status: StatusLevel;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ label, status, dot = true, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
        CLASS_MAP[status],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', {
            'bg-emerald-400 animate-live': status === 'online',
            'bg-red-400':    status === 'offline',
            'bg-amber-400':  status === 'warn',
            'bg-blue-400':   status === 'blue',
            'bg-purple-400': status === 'purple',
            'bg-slate-500':  status === 'idle',
          })}
        />
      )}
      {label}
    </span>
  );
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full shrink-0',
        online ? 'status-dot-online animate-live' : 'status-dot-offline',
      )}
    />
  );
}
