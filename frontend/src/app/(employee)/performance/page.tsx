'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { AttendanceCalendar } from '@/components/employee/attendance/attendance-calendar';
import { TrendChart } from '@/components/reports/TrendChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { Award, History } from 'lucide-react';

interface Snapshot {
  cycle_id: string;
  behaviour_score: number;
  behaviour_rating: string;
  attendance_percentage: number;
  attendance_compliance_percentage: number;
  late_count: number;
  half_day_count: number;
  unapproved_absence_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  approved_ot_hours: number;
}

const ratingColors: Record<string, string> = {
  Outstanding: 'text-emerald-600',
  Excellent: 'text-green-600',
  Good: 'text-blue-600',
  'Needs Improvement': 'text-amber-600',
  Unsatisfactory: 'text-red-600',
};

export default function EmployeePerformancePage() {
  return (
    <EmployeeGuard>
      <div className="md:hidden"><MobileHeader title="My Performance" /></div>
      <PerformanceContent />
    </EmployeeGuard>
  );
}

function PerformanceContent() {
  const { employeeProfile } = useAuthStore();
  const [cycleId, setCycleId] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(false);

  const { data: cycles = [] } = useQuery({
    queryKey: ['employee-performance-cycles'],
    queryFn: () => api.get('/performance/cycles').then((r) => r.data.data ?? []),
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ['employee-performance-snapshots'],
    queryFn: () => api.get('/performance/attendance-behaviour/snapshots').then((r) => r.data.data ?? []),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['employee-performance-reviews'],
    queryFn: () => api.get('/performance/reviews').then((r) => r.data.data ?? []),
  });

  useEffect(() => {
    if (!cycleId && cycles.length) {
      const active = cycles.find((c: any) => c.status === 'active');
      setCycleId((active ?? cycles[0]).id);
    }
  }, [cycles, cycleId]);

  const snapshot: Snapshot | undefined = snapshots.find((s: any) => s.cycle_id === cycleId);
  const review = reviews.find((r: any) => r.cycle_id === cycleId);

  const trendData = useMemo(() => {
    return cycles
      .filter((c: any) => snapshots.some((s: any) => s.cycle_id === c.id))
      .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .map((c: any) => ({
        name: c.name,
        score: parseFloat(snapshots.find((s: any) => s.cycle_id === c.id)?.behaviour_score ?? 0),
      }));
  }, [cycles, snapshots]);

  return (
    <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold">My Performance</h1>
        <p className="text-muted-foreground">Attendance behaviour, KRAs/KPIs, and review history</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Review Cycle:</label>
        <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm">
          {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {snapshot ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Award className="w-4 h-4" /> Attendance Behaviour</CardTitle>
            <button onClick={() => setTimelineOpen(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> Timeline
            </button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Behaviour Score</p>
              <p className="text-2xl font-bold">{snapshot.behaviour_score}</p>
              <p className={`text-xs font-semibold ${ratingColors[snapshot.behaviour_rating] ?? ''}`}>{snapshot.behaviour_rating}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attendance %</p>
              <p className="text-2xl font-bold">{snapshot.attendance_percentage}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Compliance %</p>
              <p className="text-2xl font-bold">{snapshot.attendance_compliance_percentage}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Late Count</p>
              <p className="text-2xl font-bold">{snapshot.late_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Half Days</p>
              <p className="text-lg font-semibold">{snapshot.half_day_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unapproved Absence</p>
              <p className="text-lg font-semibold">{snapshot.unapproved_absence_days}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approved Leave</p>
              <p className="text-lg font-semibold">{snapshot.paid_leave_days + snapshot.unpaid_leave_days}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approved OT Hours</p>
              <p className="text-lg font-semibold">{snapshot.approved_ot_hours}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Attendance behaviour hasn't been calculated for this cycle yet.
        </CardContent></Card>
      )}

      {trendData.length > 1 && (
        <TrendChart title="Performance Trend (Attendance Behaviour Score by Cycle)" type="line" xKey="name" data={trendData} series={[{ key: 'score', label: 'Score' }]} />
      )}

      <Card>
        <CardHeader><CardTitle>Attendance Calendar</CardTitle></CardHeader>
        <CardContent><AttendanceCalendar /></CardContent>
      </Card>

      {review && (
        <Card>
          <CardHeader><CardTitle>Performance Review</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">KRA Score</p><p className="font-semibold">{review.kra_score ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">KPI Score</p><p className="font-semibold">{review.kpi_score ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Attendance Score</p><p className="font-semibold">{review.attendance_score ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Overall Score</p><p className="font-bold">{review.overall_score ?? '—'}</p></div>
            </div>
            <p className="text-sm capitalize"><span className="text-muted-foreground">Rating: </span>{review.rating?.replace(/_/g, ' ') || '—'}</p>
            {review.reviewer_comments && <p className="text-sm text-muted-foreground border-t border-border pt-3">{review.reviewer_comments}</p>}
          </CardContent>
        </Card>
      )}

      {timelineOpen && employeeProfile && (
        <TimelineModal employeeId={employeeProfile.id} cycleId={cycleId} onClose={() => setTimelineOpen(false)} />
      )}
    </div>
  );
}

function TimelineModal({ employeeId, cycleId, onClose }: { employeeId: string; cycleId: string; onClose: () => void }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['employee-performance-timeline', employeeId, cycleId],
    queryFn: () => api.get('/performance/timeline', { params: { employee_id: employeeId, cycle_id: cycleId } }).then((r) => r.data.data ?? []),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-4 flex items-center gap-2"><History className="w-4 h-4" /> Performance Timeline</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events recorded yet</p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-5">
            {events.map((e: any, i: number) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">{e.label}</p>
                <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString('en-IN')}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
