'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { TrendChart } from '@/components/reports/TrendChart';
import { Award, AlertTriangle, Users } from 'lucide-react';

export default function ManagerPerformancePage() {
  const [cycleId, setCycleId] = useState('');

  const { data: cycles = [] } = useQuery({
    queryKey: ['manager-performance-cycles'],
    queryFn: () => api.get('/performance/cycles').then((r) => r.data.data ?? []),
  });

  useEffect(() => {
    if (!cycleId && cycles.length) {
      const active = cycles.find((c: any) => c.status === 'active');
      setCycleId((active ?? cycles[0]).id);
    }
  }, [cycles, cycleId]);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['manager-performance-summary', cycleId],
    queryFn: () => api.get('/performance/attendance-behaviour/summary', { params: { cycle_id: cycleId } }).then((r) => r.data.data),
    enabled: !!cycleId,
  });

  const { data: snapshots = [], isLoading: loadingSnapshots } = useQuery({
    queryKey: ['manager-performance-snapshots', cycleId],
    queryFn: () => api.get('/performance/attendance-behaviour/snapshots', { params: { cycle_id: cycleId } }).then((r) => r.data.data ?? []),
    enabled: !!cycleId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Team Performance</h1>
          <p className="text-xs text-slate-400">Attendance behaviour for your direct reports</p>
        </div>
        <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loadingSummary || !summary ? (
        <div className="p-12 flex justify-center"><div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Average Score</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{summary.averageScore.toFixed(1)}</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Attendance %</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">{summary.averageAttendancePct.toFixed(1)}%</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Size</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1 flex items-center gap-2"><Users className="w-5 h-5 text-amber-500" /> {summary.totalEmployees}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Team Attendance Behaviour</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">vs. team average of {summary.averageScore.toFixed(1)}</p>
            </div>
            {loadingSnapshots ? (
              <div className="p-8 flex justify-center"><div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : snapshots.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No attendance behaviour data for this cycle yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-bold">Employee</th>
                      <th className="text-right px-4 py-2.5 font-bold">Score</th>
                      <th className="text-right px-4 py-2.5 font-bold">Attendance %</th>
                      <th className="text-right px-4 py-2.5 font-bold">Late</th>
                      <th className="text-right px-4 py-2.5 font-bold">Half Days</th>
                      <th className="text-right px-4 py-2.5 font-bold">Unpaid Leave</th>
                      <th className="text-right px-4 py-2.5 font-bold">OT Hrs</th>
                      <th className="text-left px-4 py-2.5 font-bold">vs. Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snapshots.map((s: any) => {
                      const diff = parseFloat(s.behaviour_score) - summary.averageScore;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{s.first_name} {s.last_name}</td>
                          <td className="px-4 py-2.5 text-right font-bold">{s.behaviour_score}</td>
                          <td className="px-4 py-2.5 text-right">{s.attendance_percentage}%</td>
                          <td className="px-4 py-2.5 text-right">{s.late_count}</td>
                          <td className="px-4 py-2.5 text-right">{s.half_day_count}</td>
                          <td className="px-4 py-2.5 text-right">{s.unpaid_leave_days}</td>
                          <td className="px-4 py-2.5 text-right">{s.approved_ot_hours}</td>
                          <td className={`px-4 py-2.5 font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {snapshots.length > 1 && (
            <TrendChart
              title="Team Behaviour Score Comparison"
              type="bar" xKey="name"
              data={snapshots.map((s: any) => ({ name: `${s.first_name} ${s.last_name}`, score: parseFloat(s.behaviour_score) }))}
              series={[{ key: 'score', label: 'Score' }]}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">Top Performers</h3>
              </div>
              <div className="p-4 space-y-2">
                {summary.topPerformers.length === 0 ? <p className="text-xs text-slate-400">No data yet</p> : summary.topPerformers.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{e.first_name} {e.last_name}</span>
                    <span className="font-bold text-slate-900">{e.behaviour_score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-slate-800">Needs Attention</h3>
              </div>
              <div className="p-4 space-y-2">
                {summary.needsAttention.length === 0 ? <p className="text-xs text-slate-400">No data yet</p> : summary.needsAttention.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{e.first_name} {e.last_name}</span>
                    <span className="font-bold text-red-600">{e.behaviour_score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
