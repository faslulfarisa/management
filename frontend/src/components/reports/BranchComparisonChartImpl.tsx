'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import type { BranchComparisonChartProps } from './BranchComparisonChart';

export default function BranchComparisonChartImpl({
  data,
  metric,
  metricLabel,
  title,
  height = 280,
  color = '#2563eb',
}: BranchComparisonChartProps) {
  // Dynamic height for many branches
  const chartHeight = Math.max(height, data.length * 40 + 40);

  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      {title && <p className="text-sm font-medium text-foreground mb-4">{title}</p>}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="branch"
            tick={{ fontSize: 11 }}
            width={100}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(v) => [v, metricLabel ?? metric]}
          />
          <Bar dataKey={metric} radius={[0, 4, 4, 0]} maxBarSize={32}>
            {data.map((_, i) => (
              <Cell key={i} fill={i % 2 === 0 ? color : `${color}bb`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
