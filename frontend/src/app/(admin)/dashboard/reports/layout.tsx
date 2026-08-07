'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BarChart2, Users, DollarSign, Wallet,
  CalendarDays, Clock, Fingerprint, GitBranch, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS, type Permission } from '@/lib/permissions';

type NavLink = { type: 'link'; label: string; href: string; icon: React.ElementType; live?: boolean; permission: Permission };
type NavDivider = { type: 'divider' };
type NavItem = NavLink | NavDivider;

const NAV: NavItem[] = [
  { type: 'link', label: 'Analytics Dashboard', href: '/dashboard/reports/analytics', icon: LayoutDashboard, live: true, permission: PERMISSIONS.REPORTS_VIEW },
  { type: 'divider' },
  { type: 'link', label: 'Attendance',   href: '/dashboard/reports/attendance',  icon: BarChart2,    permission: PERMISSIONS.REPORTS_ATTENDANCE },
  { type: 'link', label: 'Employee',     href: '/dashboard/reports/employee',     icon: Users,        permission: PERMISSIONS.REPORTS_VIEW },
  { type: 'link', label: 'Payroll',      href: '/dashboard/reports/payroll',      icon: DollarSign,   permission: PERMISSIONS.REPORTS_PAYROLL },
  { type: 'link', label: 'Leave',        href: '/dashboard/reports/leave',        icon: CalendarDays, permission: PERMISSIONS.REPORTS_VIEW },
  { type: 'link', label: 'Shift & Rota', href: '/dashboard/reports/shift',        icon: Clock,        permission: PERMISSIONS.REPORTS_ATTENDANCE },
  { type: 'link', label: 'Biometrics',  href: '/dashboard/reports/biometrics',   icon: Fingerprint,   permission: PERMISSIONS.REPORTS_ATTENDANCE },
  { type: 'link', label: 'Branch',      href: '/dashboard/reports/branch',       icon: GitBranch,     permission: PERMISSIONS.REPORTS_VIEW },
  { type: 'link', label: 'Finance',     href: '/dashboard/reports/finance',      icon: Wallet,        permission: PERMISSIONS.REPORTS_VIEW },
  { type: 'link', label: 'Compliance',  href: '/dashboard/reports/compliance',   icon: ShieldCheck,   permission: PERMISSIONS.REPORTS_VIEW },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard/reports') return pathname === href;
  return pathname.startsWith(href);
}

/** Drops links the user lacks permission for, and collapses any resulting redundant dividers. */
function filterNav(nav: NavItem[], permissions: string[]): NavItem[] {
  const visible = nav.filter(item => item.type === 'divider' || permissions.includes(item.permission));
  const result: NavItem[] = [];
  for (const item of visible) {
    if (item.type === 'divider') {
      if (result.length === 0 || result[result.length - 1].type === 'divider') continue;
      result.push(item);
    } else {
      result.push(item);
    }
  }
  if (result.length && result[result.length - 1].type === 'divider') result.pop();
  return result;
}

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const permissions = useAuthStore((s) => s.permissions);
  const nav = useMemo(() => filterNav(NAV, permissions), [permissions]);
  const links = useMemo(() => nav.filter((n): n is NavLink => n.type === 'link'), [nav]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Reports &amp; Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Enterprise reporting across all Ai-HRMS modules</p>
      </div>

      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-none w-fit max-w-full">
        {links.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all',
                active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
