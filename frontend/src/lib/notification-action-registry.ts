'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { notificationsApi, type NotificationItem } from '@/lib/notifications-api';

export type NotificationActionType =
  | 'VIEW'
  | 'EDIT'
  | 'APPROVE'
  | 'REJECT'
  | 'DETAILS'
  | 'DOWNLOAD'
  | 'OPEN_MODAL'
  | 'OPEN_DRAWER'
  | 'OPEN_TIMELINE'
  | 'OPEN_CHAT'
  | 'CUSTOM';

export interface ActionableNotification {
  id: string;
  source_module?: string | null;
  module?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  action_url?: string | null;
  action_type?: NotificationActionType | string | null;
  status?: string | null;
  priority?: string | null;
  metadata?: Record<string, any> | null;
  is_read?: boolean;
  read?: boolean;
  href?: string | null;
}

interface RegistryEntry {
  module: string;
  entityType: string;
  route: string | ((notification: ActionableNotification) => string);
  defaultAction?: NotificationActionType;
  defaultBehaviour?: 'page' | 'drawer' | 'modal' | 'timeline' | 'chat' | 'download';
}

export interface ResolvedNotificationAction {
  href: string;
  actionType: NotificationActionType;
  behaviour: RegistryEntry['defaultBehaviour'];
  entityId: string | null;
  source: 'action_url' | 'registry' | 'fallback';
}

const MODULE_FALLBACK_ROUTES: Record<string, string> = {
  approvals: '/dashboard/approvals',
  attendance: '/dashboard/hr/attendance',
  biometrics: '/dashboard/biometrics',
  documents: '/dashboard/compliance/employee-documents',
  employee: '/dashboard/hr/employees',
  employee_events: '/dashboard/hr/employees',
  employees: '/dashboard/hr/employees',
  expense: '/dashboard/finance/expenses',
  exit: '/dashboard/hr/exit-management',
  exit_management: '/dashboard/hr/exit-management',
  leave: '/dashboard/hr/leave',
  payroll: '/dashboard/hr/payroll',
  recruitment: '/dashboard/hr/recruitment',
  shift: '/dashboard/approvals',
  system: '/dashboard/notifications',
};

const NOTIFICATION_ACTION_REGISTRY: RegistryEntry[] = [
  { module: 'leave', entityType: 'leave_request', route: '/dashboard/hr/leave', defaultAction: 'APPROVE', defaultBehaviour: 'drawer' },
  { module: 'approvals', entityType: 'leave_request', route: '/dashboard/approvals', defaultAction: 'APPROVE', defaultBehaviour: 'drawer' },
  { module: 'expense', entityType: 'expense_claim', route: '/dashboard/finance/expenses', defaultAction: 'APPROVE', defaultBehaviour: 'drawer' },
  { module: 'finance', entityType: 'expense_claim', route: '/dashboard/finance/expenses', defaultAction: 'APPROVE', defaultBehaviour: 'drawer' },
  { module: 'attendance', entityType: 'attendance_correction', route: '/dashboard/biometrics/corrections', defaultAction: 'APPROVE', defaultBehaviour: 'drawer' },
  { module: 'attendance', entityType: 'attendance_record', route: '/dashboard/hr/attendance', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'shift', entityType: 'shift_override', route: '/dashboard/approvals', defaultAction: 'APPROVE', defaultBehaviour: 'modal' },
  { module: 'approvals', entityType: 'shift_override', route: '/dashboard/approvals', defaultAction: 'APPROVE', defaultBehaviour: 'modal' },
  { module: 'recruitment', entityType: 'candidate', route: (n) => (n.entity_id ? `/dashboard/hr/recruitment/candidates/${n.entity_id}` : '/dashboard/hr/recruitment/candidates'), defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'recruitment', entityType: 'interview', route: '/dashboard/hr/recruitment/interviews', defaultAction: 'DETAILS', defaultBehaviour: 'modal' },
  { module: 'recruitment', entityType: 'offer', route: (n) => (n.entity_id ? `/dashboard/hr/recruitment/offers/${n.entity_id}` : '/dashboard/hr/recruitment/offers'), defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'payroll', entityType: 'payroll_run', route: '/dashboard/hr/payroll', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'payroll', entityType: 'payslip', route: '/dashboard/hr/payroll', defaultAction: 'DOWNLOAD', defaultBehaviour: 'download' },
  { module: 'exit_management', entityType: 'exit_request', route: '/dashboard/hr/exit-management', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'exit_management', entityType: 'exit_clearance', route: '/dashboard/hr/exit-management', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'employees', entityType: 'employee', route: (n) => (n.entity_id ? `/dashboard/hr/employees/${n.entity_id}` : '/dashboard/hr/employees'), defaultAction: 'DETAILS' },
  { module: 'employee', entityType: 'employee', route: (n) => (n.entity_id ? `/dashboard/hr/employees/${n.entity_id}` : '/dashboard/hr/employees'), defaultAction: 'DETAILS' },
  { module: 'employee_events', entityType: 'employee', route: (n) => (n.entity_id ? `/dashboard/hr/employees/${n.entity_id}` : '/dashboard/hr/employees'), defaultAction: 'DETAILS' },
  { module: 'documents', entityType: 'document', route: '/dashboard/compliance/employee-documents', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'compliance', entityType: 'compliance_document', route: '/dashboard/compliance/employee-documents', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
  { module: 'system', entityType: 'biometric_device', route: '/dashboard/biometrics/devices', defaultAction: 'DETAILS', defaultBehaviour: 'drawer' },
];

const DEEP_LINK_PATTERNS: Array<{ pattern: RegExp; module: string; entityType: string; route: string }> = [
  { pattern: /^\/leave\/requests\/([^/?#]+)/, module: 'leave', entityType: 'leave_request', route: '/dashboard/hr/leave' },
  { pattern: /^\/attendance\/corrections\/([^/?#]+)/, module: 'attendance', entityType: 'attendance_correction', route: '/dashboard/biometrics/corrections' },
  { pattern: /^\/shift-overrides\/([^/?#]+)/, module: 'shift', entityType: 'shift_override', route: '/dashboard/approvals' },
  { pattern: /^\/recruitment\/candidates\/([^/?#]+)/, module: 'recruitment', entityType: 'candidate', route: '/dashboard/hr/recruitment/candidates' },
  { pattern: /^\/offers\/([^/?#]+)/, module: 'recruitment', entityType: 'offer', route: '/dashboard/hr/recruitment/offers' },
  { pattern: /^\/employees\/([^/?#]+)/, module: 'employees', entityType: 'employee', route: '/dashboard/hr/employees' },
  { pattern: /^\/documents\/([^/?#]+)/, module: 'documents', entityType: 'document', route: '/dashboard/compliance/employee-documents' },
  { pattern: /^\/payroll\/runs\/([^/?#]+)/, module: 'payroll', entityType: 'payroll_run', route: '/dashboard/hr/payroll' },
];

function normalizeKey(value?: string | null) {
  return (value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function normalizeActionType(value?: string | null, fallback: NotificationActionType = 'VIEW'): NotificationActionType {
  const normalized = normalizeKey(value).toUpperCase();
  const supported: NotificationActionType[] = ['VIEW', 'EDIT', 'APPROVE', 'REJECT', 'DETAILS', 'DOWNLOAD', 'OPEN_MODAL', 'OPEN_DRAWER', 'OPEN_TIMELINE', 'OPEN_CHAT', 'CUSTOM'];
  return supported.includes(normalized as NotificationActionType) ? normalized as NotificationActionType : fallback;
}

function appendActionParams(baseHref: string, notification: ActionableNotification, entry?: RegistryEntry, actionType?: NotificationActionType) {
  const [pathWithQuery, hash = ''] = baseHref.split('#');
  const [path, query = ''] = pathWithQuery.split('?');
  const params = new URLSearchParams(query);
  const entityId = notification.entity_id ?? params.get('entity') ?? params.get('id');

  if (notification.id) params.set('notification', notification.id);
  if (entityId) {
    params.set('entity', entityId);
    params.set('focus', entityId);
  }
  if (notification.entity_type) params.set('entityType', notification.entity_type);
  if (notification.source_module) params.set('module', notification.source_module);
  if (actionType) params.set('action', actionType);
  if (entry?.defaultBehaviour) params.set('open', entry.defaultBehaviour);

  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

function rewriteDeepLink(actionUrl: string, notification: ActionableNotification) {
  for (const item of DEEP_LINK_PATTERNS) {
    const match = actionUrl.match(item.pattern);
    if (!match) continue;
    return appendActionParams(item.route, {
      ...notification,
      source_module: notification.source_module ?? item.module,
      entity_type: notification.entity_type ?? item.entityType,
      entity_id: notification.entity_id ?? match[1],
    });
  }
  return null;
}

export function resolveNotificationAction(notification: ActionableNotification): ResolvedNotificationAction | null {
  const metadata = notification.metadata ?? {};
  const actionType = normalizeActionType(notification.action_type ?? metadata.action_type ?? metadata.actionType, 'VIEW');
  const rawUrl = notification.action_url ?? notification.href ?? null;

  if (rawUrl) {
    const rewritten = rawUrl.startsWith('/') ? rewriteDeepLink(rawUrl, notification) : null;
    return {
      href: rewritten ?? appendActionParams(rawUrl, notification, undefined, actionType),
      actionType,
      behaviour: undefined,
      entityId: notification.entity_id ?? null,
      source: 'action_url',
    };
  }

  const moduleKey = normalizeKey(notification.source_module ?? notification.module ?? metadata.module);
  const entityTypeKey = normalizeKey(notification.entity_type ?? metadata.entity_type ?? metadata.entityType);
  const entry = NOTIFICATION_ACTION_REGISTRY.find(
    (item) => normalizeKey(item.module) === moduleKey && normalizeKey(item.entityType) === entityTypeKey,
  );

  if (entry) {
    const route = typeof entry.route === 'function' ? entry.route(notification) : entry.route;
    const resolvedActionType = normalizeActionType(notification.action_type ?? metadata.action_type ?? metadata.actionType, entry.defaultAction ?? 'VIEW');
    return {
      href: appendActionParams(route, notification, entry, resolvedActionType),
      actionType: resolvedActionType,
      behaviour: entry.defaultBehaviour,
      entityId: notification.entity_id ?? null,
      source: 'registry',
    };
  }

  const fallbackRoute = MODULE_FALLBACK_ROUTES[moduleKey];
  if (!fallbackRoute) return null;

  return {
    href: appendActionParams(fallbackRoute, notification, undefined, actionType),
    actionType,
    behaviour: undefined,
    entityId: notification.entity_id ?? null,
    source: 'fallback',
  };
}

async function markNotificationRead(notification: ActionableNotification) {
  if (notification.is_read || notification.read) return;

  try {
    if (notification.id.includes('-')) return;
    await notificationsApi.markRead(notification.id);
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
    await api.post(`/dashboard/notifications/${notification.id}/read`).catch(() => undefined);
  }
}

export function useNotificationAction(options?: { onNavigated?: (notification: ActionableNotification, href: string) => void }) {
  const router = useRouter();
  const onNavigated = options?.onNavigated;

  return useCallback(async (notification: ActionableNotification) => {
    const action = resolveNotificationAction(notification);
    if (!action) {
      window.alert('This notification does not have a destination yet.');
      return;
    }

    try {
      router.push(action.href);
      await markNotificationRead(notification);
      onNavigated?.(notification, action.href);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) window.alert('You no longer have access.');
      else if (status === 404) window.alert('This record is no longer available.');
      else window.alert('Unable to open this notification.');
    }
  }, [onNavigated, router]);
}

export function toActionableNotification(notification: NotificationItem): ActionableNotification {
  return {
    ...notification,
    action_type: notification.action_type,
    module: notification.source_module,
  };
}
