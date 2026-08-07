'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { useTerminalStats } from '@/hooks/use-terminals';
import { TerminalList } from '@/components/biometrics/terminals/terminal-list';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { Monitor, Wifi, WifiOff, Laptop, Smartphone } from 'lucide-react';

export default function TerminalsPage() {
  useBiometricsSocket();
  const { stats, loading } = useTerminalStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Attendance Terminals</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Trusted laptop, mobile, and kiosk attendance terminals — token lifecycle management
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpStatCard
          title="Total Terminals"
          value={loading ? '…' : (stats?.total ?? 0)}
          icon={Monitor}
          variant="blue"
        />
        <OpStatCard
          title="Online"
          value={loading ? '…' : (stats?.online ?? 0)}
          icon={Wifi}
          variant={stats?.online === 0 && (stats?.total ?? 0) > 0 ? 'danger' : 'ok'}
          live
        />
        <OpStatCard
          title="Laptops"
          value={loading ? '…' : (stats?.byType.laptops ?? 0)}
          icon={Laptop}
          variant="default"
        />
        <OpStatCard
          title="Mobile / Kiosk"
          value={loading ? '…' : ((stats?.byType.mobiles ?? 0) + (stats?.byType.kiosks ?? 0))}
          icon={Smartphone}
          variant="default"
        />
      </div>

      <TerminalList />
    </div>
  );
}
