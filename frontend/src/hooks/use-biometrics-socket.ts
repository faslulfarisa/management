'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useBiometricsStore } from '@/store/biometrics.store';
import { biometricsWs } from '@/services/biometrics-ws';

/**
 * Connects the singleton biometrics WebSocket and wires its events into the
 * Zustand store. Safe to call from multiple components — the underlying service
 * de-duplicates the connection.
 */
export function useBiometricsSocket(branchId?: string) {
  const { accessToken, selectedTenantId } = useAuthStore();
  const { setWsConnected, addPunch, setQueueHealth, addAlert } = useBiometricsStore();
  const branchRef = useRef<string | undefined>(branchId);
  branchRef.current = branchId;

  useEffect(() => {
    if (!accessToken || !selectedTenantId) return;

    biometricsWs.connect({ accessToken, tenantId: selectedTenantId });

    const offConn = biometricsWs.onConnectionChange(setWsConnected);
    const offPunch = biometricsWs.onPunch(addPunch);
    const offQueue = biometricsWs.onQueueHealth(setQueueHealth);
    const offAlert = biometricsWs.onAlert(addAlert);

    // Immediately reflect current connection state
    setWsConnected(biometricsWs.isConnected);

    if (branchId) biometricsWs.subscribeBranch(branchId);

    return () => {
      offConn();
      offPunch();
      offQueue();
      offAlert();
      if (branchRef.current) biometricsWs.unsubscribeBranch(branchRef.current);
    };
  }, [accessToken, selectedTenantId]);
}
