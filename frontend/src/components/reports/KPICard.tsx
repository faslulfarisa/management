'use client';

import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLOR_MAP = {
  green:  { bg: 'bg-green-50',  value: 'text-green-700',  icon: 'text-green-600'  },
  red:    { bg: 'bg-red-50',    value: 'text-red-700',    icon: 'text-red-600'    },
  amber:  { bg: 'bg-amber-50',  value: 'text-amber-700',  icon: 'text-amber-600'  },
  blue:   { bg: 'bg-blue-50',   value: 'text-blue-700',   icon: 'text-blue-600'   },
  purple: { bg: 'bg-purple-50', value: 'text-purple-700', icon: 'text-purple-600' },
} as const;

export interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; direction: 'up' | 'down'; label: string };
  icon?: LucideIcon;
  color?: keyof typeof COLOR_MAP;
  loading?: boolean;
}

export function KPICard({ label, value, sub, trend, icon: Icon, color = 'blue', loading }: KPICardProps) {
  const c = COLOR_MAP[color];

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-3 bg-muted rounded w-20 mb-3" />
        <div className="h-7 bg-muted rounded w-16 mb-2" />
        <div className="h-3 bg-muted rounded w-24" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        {Icon && (
          <div className={cn('shrink-0 p-1.5 rounded-lg', c.bg)}>
            <Icon className={cn('w-4 h-4', c.icon)} />
          </div>
        )}
      </div>
      <p className={cn('text-2xl font-bold mt-2 tabular-nums', c.value)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          {trend.direction === 'up' ? (
            <TrendingUp className="w-3 h-3 text-green-500" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-500" />
          )}
          <span className={cn('text-xs font-medium', trend.direction === 'up' ? 'text-green-600' : 'text-red-600')}>
            {trend.value}%
          </span>
          <span className="text-xs text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
