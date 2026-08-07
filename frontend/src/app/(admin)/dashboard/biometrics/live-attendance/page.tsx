'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { PunchFeedTable } from '@/components/biometrics/live-attendance/punch-feed-table';
import { PunchFilters } from '@/components/biometrics/live-attendance/punch-filters';
import { LiveIndicator } from '@/components/biometrics/live-attendance/live-indicator';
import { useBiometricsStore } from '@/store/biometrics.store';

export default function LiveAttendancePage() {
  useBiometricsSocket();
  const { punchesToday, recentPunches } = useBiometricsStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Live Punch Feed</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {punchesToday} punches today · {recentPunches.length} in buffer
          </p>
        </div>
        <LiveIndicator />
      </div>

      <PunchFilters />
      <PunchFeedTable />
    </div>
  );
}
