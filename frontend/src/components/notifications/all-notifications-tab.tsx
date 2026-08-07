'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Archive, RotateCcw, ExternalLink, Loader2 } from 'lucide-react';
import { notificationsApi, NotificationListFilters, type NotificationItem } from '@/lib/notifications-api';
import { useNotificationAction, toActionableNotification } from '@/lib/notification-action-registry';
import { EmptyState, PriorityBadge, TypeBadge, timeAgo } from './shared';
import { FiltersBar } from './filters-bar';

export function AllNotificationsTab() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<NotificationListFilters>({ page: 1, limit: 20, status: 'active' });
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-list', filters],
    queryFn: () => notificationsApi.list(filters),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-overview'] });
  };

  const openNotification = useNotificationAction({
    onNavigated: () => {
      invalidate();
      refetch();
    },
  });

  const handleAction = async (id: string, action: 'read' | 'unread' | 'archive') => {
    setActingId(id);
    try {
      if (action === 'read') await notificationsApi.markRead(id);
      else if (action === 'unread') await notificationsApi.markUnread(id);
      else await notificationsApi.archive(id);
      invalidate();
      refetch();
    } catch {
      // best-effort
    } finally {
      setActingId(null);
    }
  };

  const handleOpen = (n: NotificationItem) => {
    openNotification(toActionableNotification(n));
  };

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const limit = filters.limit ?? 20;
  const page = filters.page ?? 1;

  return (
    <div className="space-y-4">
      <FiltersBar filters={filters} onChange={setFilters} onRefresh={refetch} refreshing={isRefetching} />

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} message="No notifications match these filters" />
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${n.is_read ? 'bg-white' : 'bg-primary/[0.03]'}`}
              >
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpen(n)}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <TypeBadge type={n.type} />
                    <PriorityBadge priority={n.priority} />
                    {n.source_module && (
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 capitalize">
                        {n.source_module.replace(/_/g, ' ')}
                      </span>
                    )}
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </div>
                  <p className={`text-sm font-semibold truncate ${n.is_read ? 'text-foreground/80' : 'text-foreground'}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground/70">
                    <span>{timeAgo(n.created_at)}</span>
                    {n.branch_name && <span>· {n.branch_name}</span>}
                    {n.action_url && <ExternalLink className="w-3 h-3" />}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {n.is_read ? (
                    <button
                      title="Mark unread"
                      disabled={actingId === n.id}
                      onClick={() => handleAction(n.id, 'unread')}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      title="Mark read"
                      disabled={actingId === n.id}
                      onClick={() => handleAction(n.id, 'read')}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {n.status !== 'archived' && (
                    <button
                      title="Archive"
                      disabled={actingId === n.id}
                      onClick={() => handleAction(n.id, 'archive')}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-muted-foreground">
            Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-muted"
            >
              Previous
            </button>
            <button
              disabled={page * limit >= total}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
