'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Inbox,
  CalendarCheck,
  CreditCard,
  FileText,
  Bell,
  UserCircle,
  LogOut,
  Building2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';
import { clearTenantScopedStorage } from '@/lib/org-switch';
import { cn } from '@/lib/utils';
import { getPostLogoutRedirectPath } from '@/lib/auth/logout-redirect';
import { AdminContextBanner } from '@/components/employee/layout/admin-context-banner';

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { href: '/home',       label: 'Home',       Icon: LayoutDashboard },
      { href: '/attendance', label: 'Attendance', Icon: Clock           },
      { href: '/leave',      label: 'Leave',      Icon: CalendarDays    },
      { href: '/requests',   label: 'Requests',   Icon: Inbox           },
      { href: '/shifts',     label: 'Schedule',   Icon: CalendarCheck   },
      { href: '/payslips',   label: 'Payroll',    Icon: CreditCard      },
      { href: '/documents',  label: 'Documents',  Icon: FileText        },
    ],
  },
  {
    label: 'General',
    items: [
      { href: '/notifications', label: 'Alerts',        Icon: Bell       },
      { href: '/profile',       label: 'Profile',       Icon: UserCircle },
    ],
  },
];

export function EmployeeWebSidebar() {
  const pathname = usePathname();
  const { employeeProfile, logout } = useAuthStore();

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => employeeApi.getNotifications(),
    staleTime: 60_000,
    retry: false,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['employee-pending-requests'],
    queryFn: () => approvalsApi.getSubmitted({ status: 'pending', limit: 1 }),
    staleTime: 60_000,
    retry: false,
  });

  const unreadAlerts = notifData?.unread_count ?? 0;
  const pendingCount = pendingData?.total ?? 0;

  const badgeFor = (href: string) => {
    if (href === '/notifications') return unreadAlerts;
    if (href === '/requests') return pendingCount;
    return 0;
  };

  const initials =
    [employeeProfile?.first_name?.[0], employeeProfile?.last_name?.[0]]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'E';

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col bg-white border-r border-gray-200 overflow-y-auto">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-gray-100 shrink-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-gray-900 leading-none">Ai-HRMS</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">Employee Portal</p>
        </div>
      </div>

      {/* Section switcher — only visible to admin / branch_admin users in My Space */}
      <div className="px-3 pt-3 pb-1">
        <AdminContextBanner />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                const badge = badgeFor(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                    )}
                  >
                    <Icon className={cn('h-[15px] w-[15px] shrink-0', isActive ? 'text-gray-900' : 'text-gray-400')} />
                    <span className="flex-1 truncate">{label}</span>
                    {badge > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 p-3 space-y-1 shrink-0">
        {employeeProfile && (
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-gray-900">
                {employeeProfile.first_name} {employeeProfile.last_name}
              </p>
              <p className="truncate text-[10px] leading-tight text-gray-400">
                {employeeProfile.designation_name ?? employeeProfile.department_name ?? 'Employee'}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            const redirectPath = getPostLogoutRedirectPath();
            clearTenantScopedStorage();
            logout();
            window.location.href = redirectPath;
          }}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-red-600"
        >
          <LogOut className="h-[15px] w-[15px] shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
