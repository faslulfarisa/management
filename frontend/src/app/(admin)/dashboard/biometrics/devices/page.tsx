'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { useDeviceStats } from '@/hooks/use-devices';
import { DeviceList } from '@/components/biometrics/devices/device-list';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { Server, Wifi, WifiOff, Cpu } from 'lucide-react';

export default function DevicesPage() {
  useBiometricsSocket();
  const { stats, loading } = useDeviceStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Biometric Device Registry</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Registered fingerprint, face, card, and hybrid biometric devices
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpStatCard
          title="Total Devices"
          value={loading ? '…' : (stats?.total ?? 0)}
          icon={Server}
          variant="blue"
        />
        <OpStatCard
          title="Online"
          value={loading ? '…' : (stats?.online ?? 0)}
          icon={Wifi}
          variant={stats?.online === 0 ? 'danger' : 'ok'}
          live
        />
        <OpStatCard
          title="Offline"
          value={loading ? '…' : (stats?.offline ?? 0)}
          icon={WifiOff}
          variant={stats && stats.offline > 0 ? 'danger' : 'ok'}
        />
        <OpStatCard
          title="Providers"
          value={loading ? '…' : (stats?.byProvider.length ?? 0)}
          icon={Cpu}
          variant="purple"
        />
      </div>

      {/* Device list */}
      <DeviceList />
    </div>
  );
}
