'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { OperationsSidebar } from '@/components/operations/operations-sidebar';
import { OperationsHeader } from '@/components/operations/operations-header';
import { consumePostLogoutRedirectPath } from '@/lib/auth/logout-redirect';
import { getCurrentPortalKind } from '@/lib/portal-host';

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, isInternalStaff, _hydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!_hydrated) return;

    if (getCurrentPortalKind() === 'customer') {
      router.push('/login');
      return;
    }

    if (!accessToken) {
      router.push(consumePostLogoutRedirectPath() ?? '/login');
      return;
    }
    // Customer hierarchy roles do not bypass this; only internal staff
    // accounts can enter operations.
    // account (including internal_role: 'platform_super_admin') gets in.
    if (!isInternalStaff) {
      router.push('/dashboard');
      return;
    }

    setAuthorized(true);
  }, [_hydrated, accessToken, isInternalStaff, pathname, router]);

  if (!_hydrated || !authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <OperationsSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <OperationsHeader onMenuClick={() => setSidebarOpen(true)} />

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="pl-0 md:pl-64 pt-16 min-h-screen transition-all duration-300">
        <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
