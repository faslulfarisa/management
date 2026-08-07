'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';
import { resolveLabel } from '@/lib/navigation/route-labels';

function NavigationHistoryTrackerInner() {
  const pathname = usePathname() ?? '/dashboard';
  const searchParams = useSearchParams();
  const push = useNavigationHistoryStore((s) => s.push);

  useEffect(() => {
    const search = searchParams.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    push(path, resolveLabel(pathname));
  }, [pathname, searchParams, push]);

  return null;
}

/**
 * Invisible component that records every visited page in the navigation
 * history store, used by the breadcrumb and back-button.
 */
export function NavigationHistoryTracker() {
  return (
    <Suspense fallback={null}>
      <NavigationHistoryTrackerInner />
    </Suspense>
  );
}
