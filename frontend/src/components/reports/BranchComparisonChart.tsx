'use client';

import dynamic from 'next/dynamic';

export interface BranchDataPoint {
  branch: string;
  [key: string]: string | number;
}

export interface BranchComparisonChartProps {
  data: BranchDataPoint[];
  metric: string;
  metricLabel?: string;
  title?: string;
  height?: number;
  color?: string;
}

// recharts is ~100KB+ and only needed on the few report pages that render this
// chart — load it on demand instead of bundling it into every page that
// imports from '@/components/reports'.
export const BranchComparisonChart = dynamic<BranchComparisonChartProps>(
  () => import('./BranchComparisonChartImpl'),
  {
    ssr: false,
    loading: () => <div className="h-[280px] w-full animate-pulse rounded-2xl bg-muted/40" />,
  },
);
