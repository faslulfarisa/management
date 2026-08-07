'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Activity, Server, Monitor, ShieldCheck,
  AlertTriangle, GitBranch, ClipboardList, LayoutDashboard,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Overview',    href: '/dashboard/biometrics',                 icon: LayoutDashboard },
  { label: 'Live Feed',   href: '/dashboard/biometrics/live-attendance', icon: Activity },
  { label: 'Devices',     href: '/dashboard/biometrics/devices',         icon: Server },
  { label: 'Terminals',   href: '/dashboard/biometrics/terminals',       icon: Monitor },
  { label: 'Providers',   href: '/dashboard/biometrics/providers',       icon: ShieldCheck },
  { label: 'Queue',       href: '/dashboard/biometrics/queue-health',    icon: GitBranch },
  { label: 'DLQ',         href: '/dashboard/biometrics/dlq',            icon: AlertTriangle },
  { label: 'Corrections', href: '/dashboard/biometrics/corrections',     icon: ClipboardList },
];

export default function BiometricsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
    <div className="-mx-6 -mt-6">
      {/* Section header */}
      <div className="px-6 pt-6 pb-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-none">Biometric Operations</h1>
            <p className="text-xs text-slate-500 mt-0.5">Realtime attendance monitoring &amp; device management</p>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-0.5 overflow-x-auto scrollbar-none">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === '/dashboard/biometrics'
                ? pathname === href
                : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="p-6">{children}</div>
    </div>
  );
}
