export interface Permission {
  id: string;
  module: string;
  action: string;
  description?: string;
}

export interface PositionPreset {
  category: string;
  label: string;
  icon: string;
  description: string;
  permissions: string[]; // "module:action" strings
}

// module:action → required module:action
const DEPENDENCY_RULES: Record<string, string> = {
  'hr.attendance:approve': 'hr.attendance:view',
  'hr.attendance:edit':    'hr.attendance:view',
  'hr.leave:approve':      'hr.leave:view',
  'hr.leave:edit':         'hr.leave:view',
  'hr.payroll:approve':    'hr.payroll:view',
  'hr.payroll:edit':       'hr.payroll:view',
  'hr.payroll:create':     'hr.payroll:view',
  'hr.employees:edit':     'hr.employees:view',
  'hr.employees:delete':   'hr.employees:view',
  'hr.employees:export':   'hr.employees:view',
  'hr.compliance:create':  'hr.compliance:view',
  'hr.compliance:export':  'hr.compliance:view',
  'hr.recruitment:edit':   'hr.recruitment:view',
  'hr.recruitment:approve':'hr.recruitment:view',
  'finance.invoices:edit':    'finance.invoices:view',
  'finance.invoices:approve': 'finance.invoices:view',
  'finance.invoices:export':  'finance.invoices:view',
  'finance.bills:approve':    'finance.bills:view',
  'finance.budgets:create':   'finance.budgets:view',
  'finance.budgets:approve':  'finance.budgets:view',
  'payroll.process_payment':  'payroll.view_payments',
  'payroll.retry_payment':    'payroll.view_payments',
  'payroll.reverse_payment':  'payroll.view_payments',
  'payroll.manage_bank_details': 'payroll.view_bank_details',
};

const SENSITIVE_PATTERNS = [
  'billing.',
  'developer.',
  'payroll.process_payment',
  'payroll.reverse_payment',
  'platform.organizations:delete',
  'platform.roles:delete',
  'platform.users:delete',
];

const MODULE_GROUP_LABELS: Record<string, string> = {
  'hr.employees':        'Employee Management',
  'hr.attendance':       'Attendance',
  'hr.leave':            'Leave Management',
  'hr.payroll':          'Payroll (HR)',
  'hr.compliance':       'Compliance',
  'hr.recruitment':      'Recruitment',
  'finance.invoices':    'Invoices',
  'finance.bills':       'Bills',
  'finance.cashbook':    'Cash Book',
  'finance.budgets':     'Budgets',
  'gst.returns':         'GST Returns',
  'payroll':             'Payroll Payments',
  'platform.users':      'User Management',
  'platform.roles':      'Roles & Permissions',
  'platform.templates':  'Policy Templates',
  'platform.organizations': 'Organization',
  'billing.plans':       'Billing Plans',
  'billing.invoices':    'Billing Invoices',
  'developer.api_keys':  'API Keys',
  'developer.webhooks':  'Webhooks',
};

function permKey(perm: Permission): string {
  return `${perm.module}:${perm.action}`;
}

/** Convert "module:action" preset strings to Permission UUIDs from the live list */
export function resolvePresetIds(presetPermissions: string[], allPerms: Permission[]): string[] {
  const keyToId = new Map(allPerms.map(p => [permKey(p), p.id]));
  const ids: string[] = [];
  for (const key of presetPermissions) {
    const id = keyToId.get(key);
    if (id) ids.push(id);
  }
  return ids;
}

/** Auto-add required dependency permissions for any selected permission */
export function resolveDependencies(selectedIds: string[], allPerms: Permission[]): string[] {
  const keyToId = new Map(allPerms.map(p => [permKey(p), p.id]));
  const idToKey = new Map(allPerms.map(p => [p.id, permKey(p)]));

  const result = new Set(selectedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...result]) {
      const key = idToKey.get(id);
      if (!key) continue;
      const requiredKey = DEPENDENCY_RULES[key];
      if (!requiredKey) continue;
      const requiredId = keyToId.get(requiredKey);
      if (requiredId && !result.has(requiredId)) {
        result.add(requiredId);
        changed = true;
      }
    }
  }
  return [...result];
}

/** Returns IDs that were auto-added as dependencies (not in original selection) */
export function getDependencyAdditions(originalIds: string[], allPerms: Permission[]): string[] {
  const resolved = resolveDependencies(originalIds, allPerms);
  const original = new Set(originalIds);
  return resolved.filter(id => !original.has(id));
}

/** Returns IDs that cannot be deselected because another selected permission depends on them */
export function getLockedIds(selectedIds: string[], allPerms: Permission[]): Set<string> {
  const keyToId = new Map(allPerms.map(p => [permKey(p), p.id]));
  const idToKey = new Map(allPerms.map(p => [p.id, permKey(p)]));
  const selectedSet = new Set(selectedIds);
  const locked = new Set<string>();

  for (const id of selectedIds) {
    const key = idToKey.get(id);
    if (!key) continue;
    const requiredKey = DEPENDENCY_RULES[key];
    if (!requiredKey) continue;
    const requiredId = keyToId.get(requiredKey);
    if (requiredId && selectedSet.has(requiredId)) {
      locked.add(requiredId);
    }
  }
  return locked;
}

/** Returns true if a permission is considered sensitive / high-risk */
export function isPermissionSensitive(perm: Permission): boolean {
  const key = permKey(perm);
  return SENSITIVE_PATTERNS.some(p => key.startsWith(p) || key === p);
}

/** Count sensitive permissions in the selection */
export function countSensitive(selectedIds: string[], allPerms: Permission[]): number {
  const selectedSet = new Set(selectedIds);
  return allPerms.filter(p => selectedSet.has(p.id) && isPermissionSensitive(p)).length;
}

/** Human-readable access summary grouped by logical area */
export function getAccessSummary(selectedIds: string[], allPerms: Permission[]): string[] {
  const selectedSet = new Set(selectedIds);
  const selected = allPerms.filter(p => selectedSet.has(p.id));

  const grouped = new Map<string, string[]>();
  for (const p of selected) {
    const label = MODULE_GROUP_LABELS[p.module] ?? p.module;
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label)!.push(p.action);
  }

  const lines: string[] = [];
  for (const [label, actions] of grouped) {
    lines.push(`${label}: ${actions.join(', ')} (${actions.length})`);
  }
  return lines;
}

/** Group all permissions by their top-level module prefix (e.g. "hr", "finance", "platform") */
export function groupByTopModule(allPerms: Permission[]): Record<string, Permission[]> {
  return allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
    const top = p.module.split('.')[0];
    (acc[top] ??= []).push(p);
    return acc;
  }, {});
}

/** Module display labels for the Recommended mode cards */
export const PERMISSION_GROUP_CARDS = [
  { key: 'hr',         label: 'HR Permissions',       color: 'blue'   },
  { key: 'finance',    label: 'Finance Permissions',   color: 'emerald'},
  { key: 'payroll',    label: 'Payroll Permissions',   color: 'violet' },
  { key: 'gst',        label: 'GST / Compliance',      color: 'orange' },
  { key: 'platform',   label: 'Platform Settings',     color: 'gray'   },
  { key: 'billing',    label: 'Billing (Sensitive)',    color: 'red'    },
  { key: 'developer',  label: 'Developer (Sensitive)',  color: 'red'    },
] as const;
