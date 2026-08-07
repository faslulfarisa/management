'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell, CalendarDays, CreditCard, UserPlus, AlertTriangle,
  Clock, CheckCheck, X, ExternalLink, ListChecks,
} from 'lucide-react';
import api from '@/lib/api';
import { useNotificationAction } from '@/lib/notification-action-registry';
import { approvalsWs } from '@/services/approvals-ws';
import { useApprovalsSocket } from '@/hooks/use-approvals-socket';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  href?: string;
  source_module?: string | null;
  action_url?: string | null;
  action_type?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  status?: string | null;
  priority?: string | null;
  metadata?: Record<string, any> | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; gradient: string }> = {
  leave:    { icon: CalendarDays,   gradient: 'linear-gradient(135deg, hsl(43 90% 50%), hsl(35 95% 55%))' },
  expense:  { icon: CreditCard,     gradient: 'linear-gradient(135deg, hsl(340 80% 56%), hsl(350 85% 62%))' },
  employee: { icon: UserPlus,       gradient: 'linear-gradient(135deg, hsl(158 64% 42%), hsl(168 70% 50%))' },
  alert:    { icon: AlertTriangle,  gradient: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(275 70% 60%))' },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function NotificationDropdown() {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchNotifications = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    try {
      const res = await api.get(`/dashboard/notifications?t=${Date.now()}`, { signal: controller.signal });
      const data = res.data.data;
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err: any) {
      if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
        console.error('Failed to fetch notifications:', err);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const openNotification = useNotificationAction({
    onNavigated: (notification) => {
      setReadIds(prev => new Set(prev).add(notification.id));
      setOpen(false);
      setUnreadCount(count => Math.max(0, count - 1));
      fetchNotifications();
    },
  });

  // Fetch on mount + every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => {
      clearInterval(interval);
      fetchAbortRef.current?.abort();
    };
  }, [fetchNotifications]);

  // Keep the shared approvals/notifications socket connected and refresh on push
  useApprovalsSocket();
  useEffect(() => {
    return approvalsWs.onNewNotification(() => {
      fetchNotifications();
    });
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleNotificationClick = (n: Notification) => {
    openNotification({
      ...n,
      action_url: n.action_url ?? n.href ?? null,
      source_module: n.source_module ?? n.type,
    });
  };

  const markAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
    setUnreadCount(0);
  };

  const effectiveUnread = notifications.filter(n => !n.read && !readIds.has(n.id)).length;

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
        title="Notifications"
      >
        <Bell className={`w-[18px] h-[18px] transition-colors ${open ? 'text-primary' : 'text-muted-foreground'}`} />
        {effectiveUnread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 ring-2 ring-white">
            {effectiveUnread > 9 ? '9+' : effectiveUnread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {effectiveUnread > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {effectiveUnread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {effectiveUnread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-8 h-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
                <p className="text-xs text-muted-foreground mt-3">Loading…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
                  <Bell className="w-6 h-6 text-muted-foreground opacity-40" />
                </div>
                <p className="text-sm font-medium text-foreground">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No new notifications</p>
              </div>
            ) : (
              <div className="p-1.5">
                {notifications.map(n => {
                  const isRead = n.read || readIds.has(n.id);
                  const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.alert;
                  const Icon = config.icon;

                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150 group ${
                        isRead
                          ? 'hover:bg-muted/50'
                          : 'bg-primary/[0.03] hover:bg-primary/[0.06]'
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs shrink-0 mt-0.5 shadow-sm"
                        style={{ background: config.gradient }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-semibold truncate ${isRead ? 'text-foreground/70' : 'text-foreground'}`}>
                            {n.title}
                          </p>
                          {!isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 truncate ${isRead ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Clock className="w-2.5 h-2.5 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground/60">{timeAgo(n.time)}</span>
                        </div>
                      </div>

                      {/* Arrow on hover */}
                      {n.href && (
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity shrink-0 mt-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border bg-muted/20">
            {notifications.length > 0 && (
              <p className="text-[10px] text-center text-muted-foreground mb-1.5">
                Showing latest {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </p>
            )}
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 py-1 transition-colors"
            >
              <ListChecks className="w-3.5 h-3.5" />
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
