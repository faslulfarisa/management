'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { NavigationHistoryTracker } from '@/components/layout/navigation-history-tracker';
import { OperationsHeader } from '@/components/operations/operations-header';
import { OperationsSidebar } from '@/components/operations/operations-sidebar';
import { useAuthStore } from '@/store/auth.store';

export function GlobalProfileShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isInternalStaff } = useAuthStore();

  const SidebarComponent = isInternalStaff ? OperationsSidebar : Sidebar;
  const HeaderComponent = isInternalStaff ? OperationsHeader : Header;

  return (
    <div className="min-h-screen bg-background relative">
      <SidebarComponent isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <HeaderComponent onMenuClick={() => setSidebarOpen(true)} />
      <NavigationHistoryTracker />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="pl-0 md:pl-64 pt-16 min-h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
