'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, FileText, DollarSign, User, AlertCircle } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalNotifications } from '@/components/employee/desktop/portal-notifications';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { SkeletonRow } from '@/components/employee/shared/skeleton-card';
import { cn } from '@/lib/utils';
import { useNotificationAction } from '@/lib/notification-action-registry';

const typeConfig: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  leave:    { icon: FileText,    bg: 'bg-blue-100',   color: 'text-blue-600'   },
  expense:  { icon: DollarSign,  bg: 'bg-amber-100',  color: 'text-amber-600'  },
  employee: { icon: User,        bg: 'bg-purple-100', color: 'text-purple-600' },
  alert:    { icon: AlertCircle, bg: 'bg-red-100',    color: 'text-red-600'    },
  default:  { icon: Bell,        bg: 'bg-muted',      color: 'text-muted-foreground' },
};

export default function NotificationsPage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileNotificationsContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalNotifications />
      </div>
    </EmployeeGuard>
  );
}

function MobileNotificationsContent() {
  const queryClient = useQueryClient();
  const openNotification = useNotificationAction({
    onNavigated: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => employeeApi.getNotifications(),
    staleTime: 30_000,
  });

  const markRead = useMutation({
    mutationFn: () => employeeApi.markNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread_count ?? 0;

  return (
    <div className="flex flex-col">
      <MobileHeader
        title="Notifications"
        rightAction={
          unread > 0 ? (
            <button
              onClick={() => markRead.mutate()}
              className="flex items-center gap-1 text-xs text-primary font-medium h-8 px-2 rounded-lg hover:bg-primary/10 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          ) : null
        }
      />

      <div className="pb-6">
        {isLoading ? (
          <div className="px-4 space-y-1 pt-4">
            {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
          </div>
        ) : notifications.length ? (
          <div className="divide-y divide-border">
            {notifications.map((n) => {
              const cfg = typeConfig[n.type] ?? typeConfig.default;
              const Icon = cfg.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification({
                    ...n,
                    action_url: n.action_url ?? n.href ?? null,
                    source_module: n.source_module ?? n.type,
                  })}
                  className={cn('flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-muted/50', !n.read && 'bg-primary/5')}
                >
                  <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                    <Icon className={cn('h-4 w-4', cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm leading-snug', !n.read ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                        {n.title}
                      </p>
                      {!n.read && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="No notifications"
            subtitle="You're all caught up!"
            className="mt-12"
          />
        )}
      </div>
    </div>
  );
}
