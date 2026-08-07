'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { usePermissionsSync } from '@/hooks/use-permissions';

export function StoreHydration() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  usePermissionsSync();

  return null;
}
