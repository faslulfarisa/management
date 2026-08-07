'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { biometricsWs } from '@/services/biometrics-ws';

export interface RealtimePunch {
  employee_name: string;
  employee_code: string;
  branch: string;
  direction: 'IN' | 'OUT';
  time: string;
  verify_method?: string;
}

export function useRealtimeAttendance(branchId?: string) {
  const { accessToken, selectedTenantId } = useAuthStore();
  const [recentPunches, setRecentPunches] = useState<RealtimePunch[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const branchRef = useRef(branchId);
  branchRef.current = branchId;

  useEffect(() => {
    if (!accessToken || !selectedTenantId) return;

    biometricsWs.connect({ accessToken, tenantId: selectedTenantId });
    setIsConnected(biometricsWs.isConnected);

    const offConn = biometricsWs.onConnectionChange(setIsConnected);
    const offPunch = biometricsWs.onPunch((event: any) => {
      setRecentPunches(prev =>
        [
          {
            employee_name: event.employee_name ?? 'Unknown',
            employee_code: event.employee_code ?? '',
            branch: event.branch_name ?? '',
            direction: event.direction ?? 'IN',
            time: event.punch_time ?? new Date().toISOString(),
            verify_method: event.verify_method,
          },
          ...prev,
        ].slice(0, 20),
      );
    });

    if (branchId) biometricsWs.subscribeBranch(branchId);

    return () => {
      offConn();
      offPunch();
      if (branchRef.current) biometricsWs.unsubscribeBranch(branchRef.current);
    };
  }, [accessToken, selectedTenantId]);

  return { recentPunches, isConnected };
}
