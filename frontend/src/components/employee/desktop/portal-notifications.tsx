'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, FileText, DollarSign, User, AlertCircle } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { Icon: React.ElementType; bg: string; color: string }> = {
  leave:    { Icon: FileText,    bg: 'bg-blue-100',   color: 'text-blue-600'   },
  expense:  { Icon: DollarSign,  bg: 'bg-amber-100',  color: 'text-amber-600'  },
  employee: { Icon: User,        bg: 'bg-purple-100', color: 'text-purple-600' },
  alert:    { Icon: AlertCircle, bg: 'bg-red-100',    color: 'text-red-600'    },
  default:  { Icon: Bell,        bg: 'bg-gray-100',   color: 'text-gray-500'   },
};

export function PortalNotifications() {
  const queryClient = useQueryClient();

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
    <div>
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-bold text-gray-900">Notifications</h1>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markRead.mutate()}
            className="h-8 gap-1.5 text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="p-6 max-w-[800px]">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-4">
                  <div className="h-9 w-9 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map((n) => {
                const cfg = typeConfig[n.type] ?? typeConfig.default;
                const Icon = cfg.Icon;
                return (
                  <div
                    key={n.id}
                    className={cn('flex items-start gap-3 px-5 py-4 transition-colors', !n.read && 'bg-primary/5')}
                  >
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                      <Icon className={cn('h-4 w-4', cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 justify-between">
                        <p className={cn('text-[13px] leading-snug', !n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[11px] text-gray-400">
                            {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
                          </p>
                          {!n.read && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                      <p className="text-[12px] text-gray-500 mt-0.5">{n.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
