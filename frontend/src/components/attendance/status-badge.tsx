'use client';

import { Check, Clock, X, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'present' | 'absent' | 'half_day' | 'late';
  className?: string;
}

const statusConfig = {
  present: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    icon: Check,
    label: 'Present',
  },
  absent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: X,
    label: 'Absent',
  },
  half_day: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: Moon,
    label: 'Half Day',
  },
  late: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: Clock,
    label: 'Late',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-medium text-sm',
        config.bg,
        config.border,
        config.text,
        className,
      )}
    >
      <Icon className="w-4 h-4" />
      {config.label}
    </div>
  );
}
