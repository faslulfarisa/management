'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { NavigationHistoryTracker } from '@/components/layout/navigation-history-tracker';
import { AdminMobileShell, useAdminMobileViewport } from '@/components/admin-mobile/admin-mobile-shell';

export function AdminChrome({
  children,
  noChromePaths = [],
}: {
  children: React.ReactNode;
  noChromePaths?: string[];
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isMobile = useAdminMobileViewport();

  if (noChromePaths.includes(pathname ?? '')) {
    return <>{children}</>;
  }

  if (isMobile) {
    return <AdminMobileShell pathname={pathname ?? '/dashboard'} />;
  }

  return (
    <div className="min-h-screen bg-background relative">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <NavigationHistoryTracker />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="pl-0 md:pl-64 pt-16 min-h-screen transition-all duration-300">
        <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
