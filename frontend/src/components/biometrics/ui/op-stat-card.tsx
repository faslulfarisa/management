import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type Variant = 'default' | 'ok' | 'warn' | 'danger' | 'blue' | 'purple';

const VARIANT_STYLES: Record<Variant, { icon: string; value: string; glow: string; badge: string }> = {
  default: { icon: 'bg-slate-100 text-slate-600',       value: 'text-slate-800',   glow: '',           badge: 'badge-blue'    },
  ok:      { icon: 'bg-emerald-100 text-emerald-600',   value: 'text-emerald-700', glow: 'glow-emerald', badge: 'badge-online'  },
  warn:    { icon: 'bg-amber-100 text-amber-600',       value: 'text-amber-700',   glow: 'glow-amber',   badge: 'badge-warn'    },
  danger:  { icon: 'bg-red-100 text-red-600',           value: 'text-red-700',     glow: 'glow-red',     badge: 'badge-offline' },
  blue:    { icon: 'bg-blue-100 text-blue-600',         value: 'text-blue-700',    glow: 'glow-blue',    badge: 'badge-blue'    },
  purple:  { icon: 'bg-purple-100 text-purple-600',     value: 'text-purple-700',  glow: '',             badge: 'badge-purple'  },
};

interface OpStatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  variant?: Variant;
  live?: boolean;
  className?: string;
}

export function OpStatCard({
  title,
  value,
  sub,
  icon: Icon,
  variant = 'default',
  live = false,
  className,
}: OpStatCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className={cn('ops-panel p-4 flex items-start gap-3 relative overflow-hidden', styles.glow, className)}>
      {live && (
        <span className="absolute top-3 right-3 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
        </span>
      )}

      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', styles.icon)}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{title}</p>
        <p className={cn('text-2xl font-bold mt-0.5 tabular-nums', styles.value)}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}
