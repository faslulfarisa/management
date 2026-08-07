'use client';

import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Home, Inbox, Users, ArrowLeftRight, LogOut, Sparkles, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resetOrgScopedState } from '@/lib/org-switch';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, employeeProfile, _hydrated, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (_hydrated) {
      if (!accessToken) {
        router.push('/login');
        return;
      }

      // Check if employee is manager (or an org admin who can view the manager layout too).
      const isManager = employeeProfile?.is_manager === true;
      const isAdmin = JSON.parse(localStorage.getItem('tenants') || '[]').some((t: any) => t.isOrgAdmin);

      if (!isManager && !isAdmin) {
        router.push('/home'); // Send regular employees back to employee home
      } else {
        setAuthorized(true);
      }
    }
  }, [_hydrated, accessToken, employeeProfile, router]);

  if (!_hydrated || !authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const navItems = [
    { href: '/manager/dashboard', label: 'Overview', icon: Home },
    { href: '/manager/approvals', label: 'Inbox', icon: Inbox },
    { href: '/manager/attendance', label: 'Team', icon: Users },
    { href: '/manager/performance', label: 'Performance', icon: Award },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 bg-slate-900 text-white flex-col shrink-0 min-h-screen fixed left-0 top-0 z-20">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-bold">
            M
          </div>
          <div>
            <h2 className="font-bold leading-none text-white">Ai-HRMS Manager</h2>
            <p className="text-[10px] text-white/50 mt-1 uppercase tracking-wider font-semibold">Team Portal</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 shrink-0">
          <Link
            href="/home"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all w-full"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Switch to Employee View
          </Link>
          <button
            onClick={() => {
              resetOrgScopedState(queryClient);
              logout();
              router.push('/login');
            }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all w-full text-left"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-40 bg-slate-900 text-white px-4 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold text-xs">
              M
            </div>
            <h2 className="font-bold text-sm leading-none text-white">Manager Portal</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/home"
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Self-Service
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 max-w-5xl w-full mx-auto pb-24 md:pb-8">
          {children}
        </main>

        {/* Bottom Bar for Mobile Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-45 bg-slate-950 border-t border-white/5 shadow-2xl">
          <div className="flex justify-around items-center h-16" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-semibold transition-colors',
                    active ? 'text-amber-500' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
