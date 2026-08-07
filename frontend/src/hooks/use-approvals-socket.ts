'use client';

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { approvalsWs } from '@/services/approvals-ws';

/**
 * Connects the singleton approvals WebSocket and invalidates React Query
 * caches when approval events arrive. Safe to mount from multiple components —
 * the underlying service de-duplicates the connection.
 */
export function useApprovalsSocket() {
  const { accessToken, selectedTenantId, user } = useAuthStore();
  const queryClient = useQueryClient();

  const invalidateInbox = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
  }, [queryClient]);

  useEffect(() => {
    const userId: string | undefined = user?.sub ?? user?.id;
    if (!accessToken || !selectedTenantId || !userId) return;

    approvalsWs.connect({ accessToken, tenantId: selectedTenantId, userId });

    const offNew = approvalsWs.onNewRequest(() => invalidateInbox());
    const offUpdate = approvalsWs.onUpdate(() => {
      queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['approvals-submitted'] });
      queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
    });
    const offResolved = approvalsWs.onResolved(() => {
      queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['approvals-submitted'] });
      queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
    });
    const offNotification = approvalsWs.onNewNotification(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-overview'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    });

    return () => {
      offNew();
      offUpdate();
      offResolved();
      offNotification();
    };
  }, [accessToken, selectedTenantId, user]);

  return { isConnected: approvalsWs.isConnected };
}

/**
 * Lightweight hook for the sidebar pending count badge.
 * Uses React Query with a 60s refetch interval + WS invalidation.
 */
export function useApprovalsPendingCount() {
  const { accessToken } = useAuthStore();
  return { enabled: !!accessToken };
}
