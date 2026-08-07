'use client';

import dynamic from 'next/dynamic';

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface TrendChartProps {
  data: Record<string, string | number>[];
  type?: 'bar' | 'line';
  xKey: string;
  series: ChartSeries[];
  height?: number;
  title?: string;
}

// recharts is ~100KB+ — load it on demand instead of bundling it into every
// page that imports from '@/components/reports'.
export const TrendChart = dynamic<TrendChartProps>(
  () => import('./TrendChartImpl'),
  {
    ssr: false,
    loading: () => <div className="h-[280px] w-full animate-pulse rounded-2xl bg-muted/40" />,
  },
);
