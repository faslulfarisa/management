'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Check, X, Clock, Moon } from 'lucide-react';

interface SummaryStatProps {
  status: 'present' | 'absent' | 'late' | 'half_day';
  count: number;
}

const statConfig = {
  present: {
    icon: Check,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: 'Present',
  },
  absent: {
    icon: X,
    bg: 'bg-red-50',
    text: 'text-red-700',
    label: 'Absent',
  },
  late: {
    icon: Clock,
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    label: 'Late',
  },
  half_day: {
    icon: Moon,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    label: 'Half Day',
  },
};

export function SummaryStat({ status, count }: SummaryStatProps) {
  const config = statConfig[status];
  const Icon = config.icon;

  return (
    <Card>
      <CardContent className={`p-6 ${config.bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              {config.label}
            </p>
            <p className={`text-3xl font-bold ${config.text}`}>{count}</p>
          </div>
          <Icon className={`w-10 h-10 ${config.text} opacity-50`} />
        </div>
      </CardContent>
    </Card>
  );
}

interface SummaryStatsProps {
  stats: SummaryStatProps[];
}

export function SummaryStats({ stats }: SummaryStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <SummaryStat key={stat.status} {...stat} />
      ))}
    </div>
  );
}
