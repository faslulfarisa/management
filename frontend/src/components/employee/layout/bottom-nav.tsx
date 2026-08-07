'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarCheck, ClipboardList, Bell, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';

const tabs = [
  { href: '/home',          label: 'Home',       Icon: Home },
  { href: '/attendance',    label: 'Attendance', Icon: CalendarCheck },
  { href: '/requests',      label: 'Requests',   Icon: ClipboardList },
  { href: '/notifications', label: 'Alerts',     Icon: Bell },
  { href: '/profile',       label: 'Profile',    Icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

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
  const pendingRequests = pendingData?.total ?? 0;

  const badgeFor = (href: string) => {
    if (href === '/notifications') return unreadAlerts;
    if (href === '/requests') return pendingRequests;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 bg-background/95 backdrop-blur-sm border-t border-border md:hidden">
      <div className="flex items-center justify-around h-16 px-1" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}>
        {tabs.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const badge = badgeFor(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.2px]')} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className={cn('text-[10px] font-medium leading-none', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
