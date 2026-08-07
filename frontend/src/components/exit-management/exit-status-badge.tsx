import { cn } from '@/lib/utils';
import { EXIT_STATUS_COLORS } from '@/types/exit';

export function ExitStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap',
        EXIT_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700',
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
