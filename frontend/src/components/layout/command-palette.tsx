'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, LayoutDashboard, Building2, Users, CalendarDays, Banknote,
  FileText, Settings, Briefcase, BarChart3, Shield, DollarSign,
  CreditCard, KeyRound, Receipt, IndianRupee,
  ArrowRight, CornerDownLeft, Loader2,
  UserCircle, Landmark, FileCheck, ClipboardList, CircleDollarSign,
} from 'lucide-react';
import api from '@/lib/api';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';

/* ── Navigation items (quick-links) ─────────────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  group: string;
  keywords?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',       href: '/dashboard',                         icon: LayoutDashboard, group: 'Pages', keywords: ['home', 'overview'] },
  { label: 'Organization',    href: '/dashboard/platform',                icon: Building2,       group: 'Pages', keywords: ['org', 'company', 'hotel'] },
  { label: 'User Management', href: '/dashboard/platform/users',          icon: Users,           group: 'Pages', keywords: ['permissions', 'roles', 'access'] },
  { label: 'Templates',       href: '/dashboard/platform/templates',      icon: FileText,        group: 'Pages', keywords: ['template', 'config'] },
  { label: 'Audit Logs',      href: '/dashboard/platform/audit-logs',     icon: Shield,          group: 'Pages', keywords: ['audit', 'log', 'activity'] },
  { label: 'Employees',       href: '/dashboard/hr/employees',       icon: Users,        group: 'Pages', keywords: ['staff', 'people', 'team'] },
  { label: 'Recruitment',     href: '/dashboard/hr/recruitment',     icon: Briefcase,    group: 'Pages', keywords: ['hiring', 'jobs', 'candidates'] },
  { label: 'Attendance',      href: '/dashboard/hr/attendance',      icon: CalendarDays, group: 'Pages', keywords: ['checkin', 'checkout', 'present'] },
  { label: 'Shifts',          href: '/dashboard/hr/shifts',          icon: CalendarDays, group: 'Pages', keywords: ['schedule', 'rotation'] },
  { label: 'Leave',           href: '/dashboard/hr/leave',           icon: CalendarDays, group: 'Pages', keywords: ['vacation', 'time-off', 'pto'] },
  { label: 'Payroll',         href: '/dashboard/hr/payroll',         icon: Banknote,     group: 'Pages', keywords: ['salary', 'wages', 'pay'] },
  { label: 'Compliance',      href: '/dashboard/hr/compliance',      icon: Shield,       group: 'Pages', keywords: ['legal', 'documents'] },
  { label: 'Performance',     href: '/dashboard/hr/performance',     icon: BarChart3,    group: 'Pages', keywords: ['review', 'appraisal', 'kpi'] },
  { label: 'Exit Management', href: '/dashboard/hr/exit-management', icon: KeyRound,     group: 'Pages', keywords: ['resign', 'termination', 'offboard'] },
  { label: 'Finance Overview', href: '/dashboard/finance',              icon: DollarSign,   group: 'Pages', keywords: ['money', 'financial'] },
  { label: 'Expenses',         href: '/dashboard/finance/expenses',     icon: CreditCard,   group: 'Pages', keywords: ['spend', 'cost'] },
  { label: 'Reimbursements',   href: '/dashboard/finance/reimbursements', icon: Receipt,    group: 'Pages', keywords: ['reimburse', 'claim'] },
  { label: 'Invoices',         href: '/dashboard/finance/invoices',     icon: FileText,     group: 'Pages', keywords: ['bill', 'invoice'] },
  { label: 'Vendor Bills',     href: '/dashboard/finance/bills',        icon: CreditCard,   group: 'Pages', keywords: ['vendor', 'purchase'] },
  { label: 'Cashbook',         href: '/dashboard/finance/cashbook',     icon: Banknote,     group: 'Pages', keywords: ['cash', 'ledger'] },
  { label: 'Budgets',          href: '/dashboard/finance/budgets',      icon: BarChart3,    group: 'Pages', keywords: ['budget', 'forecast'] },
  { label: 'GST Dashboard',    href: '/dashboard/finance/gst',          icon: IndianRupee,  group: 'Pages', keywords: ['gst', 'tax'] },
  { label: 'Notification Center', href: '/dashboard/notifications', icon: ClipboardList, group: 'Pages', keywords: ['notifications', 'alerts', 'inbox'] },
  { label: 'Settings',    href: '/dashboard/system/settings',  icon: Settings, group: 'Pages', keywords: ['config', 'preferences'] },
];

const NAV_PERMISSIONS: Record<string, string[]> = {
  '/dashboard/platform': [PERMISSIONS.BRANCH_VIEW, PERMISSIONS.BRANCH_MANAGE],
  '/dashboard/platform/users': [PERMISSIONS.PLATFORM_USERS_VIEW],
  '/dashboard/platform/templates': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/platform/audit-logs': [PERMISSIONS.AUDIT_LOGS_VIEW],
  '/dashboard/hr/employees': [PERMISSIONS.EMPLOYEES_VIEW],
  '/dashboard/hr/recruitment': [PERMISSIONS.RECRUITMENT_VIEW],
  '/dashboard/hr/attendance': [PERMISSIONS.ATTENDANCE_VIEW],
  '/dashboard/hr/shifts': [PERMISSIONS.SCHEDULES_VIEW],
  '/dashboard/hr/leave': [PERMISSIONS.LEAVE_VIEW],
  '/dashboard/hr/payroll': [PERMISSIONS.PAYROLL_VIEW],
  '/dashboard/hr/compliance': [PERMISSIONS.COMPLIANCE_VIEW],
  '/dashboard/hr/performance': [PERMISSIONS.PERFORMANCE_VIEW],
  '/dashboard/hr/exit-management': [PERMISSIONS.EXIT_VIEW],
  '/dashboard/finance': [PERMISSIONS.FINANCE_INVOICES_VIEW, PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/expenses': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/reimbursements': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/invoices': [PERMISSIONS.FINANCE_INVOICES_VIEW],
  '/dashboard/finance/bills': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/cashbook': [PERMISSIONS.FINANCE_CASHBOOK_VIEW],
  '/dashboard/finance/budgets': [PERMISSIONS.FINANCE_BUDGETS_VIEW],
  '/dashboard/finance/gst': [PERMISSIONS.GST_RETURNS_VIEW],
  '/dashboard/notifications': [PERMISSIONS.NOTIFICATIONS_VIEW],
  '/dashboard/system/settings': [PERMISSIONS.ORGANIZATION_PROFILE_EDIT],
};

function isBranchScopedAdmin(userType: string) {
  return userType === 'branch_admin' || userType === 'admin';
}

function hasAnyPermission(granted: string[], required: string[]) {
  if (!required.length) return true;
  if (!granted.length) return false;
  return required.some((permission) => granted.includes(permission));
}

function toPortalHref(href: string, portalBasePath: '/dashboard' | '/branch-admin') {
  if (portalBasePath === '/dashboard') return href;
  return href.replace(/^\/dashboard/, '/branch-admin');
}

function isNavAllowedForUserType(item: NavItem, userType: string) {
  if (item.href === '/dashboard/platform/users') return isAtLeast(userType, 'org_admin');
  if (
    item.href === '/dashboard/platform' ||
    item.href === '/dashboard/platform/templates' ||
    item.href === '/dashboard/platform/audit-logs' ||
    item.href.startsWith('/dashboard/finance') ||
    item.href.startsWith('/dashboard/system')
  ) {
    return isAtLeast(userType, 'admin');
  }
  if (item.href.startsWith('/dashboard/hr') || item.href === '/dashboard/notifications') {
    return isAtLeast(userType, 'admin');
  }
  return true;
}

/* ── Data result type icons ─────────────────────────────────────── */
const DATA_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  employee:      { icon: UserCircle,        color: 'hsl(220 65% 46%)' },
  department:    { icon: Landmark,           color: 'hsl(265 65% 50%)' },
  invoice:       { icon: FileCheck,          color: 'hsl(158 64% 42%)' },
  bill:          { icon: ClipboardList,      color: 'hsl(340 80% 56%)' },
  expense:       { icon: CircleDollarSign,   color: 'hsl(43 90% 50%)' },
  reimbursement: { icon: Receipt,            color: 'hsl(185 65% 40%)' },
  leave:         { icon: CalendarDays,       color: 'hsl(30 85% 50%)' },
  gst_invoice:   { icon: IndianRupee,        color: 'hsl(120 45% 42%)' },
};

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700',
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  paid:     'bg-emerald-100 text-emerald-700',
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-indigo-100 text-indigo-700',
  partial:  'bg-orange-100 text-orange-700',
  inactive: 'bg-gray-100 text-gray-500',
  confirmed: 'bg-emerald-100 text-emerald-700',
};

interface DataResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

/* ── Component ───────────────────────────────────────────────────── */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { permissions, userType } = useAuthStore();
  const portalBasePath = isBranchScopedAdmin(userType) ? '/branch-admin' : '/dashboard';
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dataResults, setDataResults] = useState<DataResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Filter nav items locally
  const filteredNav = useMemo(() => {
    const visibleNav = NAV_ITEMS.filter((item) => (
      isNavAllowedForUserType(item, userType) &&
      hasAnyPermission(permissions, NAV_PERMISSIONS[item.href] || [])
    ));
    if (!query.trim()) return visibleNav.slice(0, 8); // show top 8 when empty
    const q = query.toLowerCase();
    return visibleNav.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q) ||
      item.keywords?.some(k => k.includes(q))
    );
  }, [permissions, query, userType]);

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchAbortRef.current?.abort();

    if (!query.trim() || query.trim().length < 2) {
      setDataResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/dashboard/search', {
          params: { q: query.trim() },
          signal: controller.signal,
        });
        setDataResults(res.data?.data?.results || []);
      } catch (err: any) {
        if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
          setDataResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query]);

  // Build unified flat list: nav items first, then data results
  const allItems = useMemo(() => {
    const items: Array<{
      kind: 'nav' | 'data';
      label: string;
      subtitle?: string;
      href: string;
      icon: React.ElementType;
      iconColor?: string;
      group: string;
      meta?: string;
      flatIdx: number;
    }> = [];

    let idx = 0;

    // Nav items (show max 6 when data results exist)
    const navSlice = dataResults.length > 0 ? filteredNav.slice(0, 6) : filteredNav;
    for (const item of navSlice) {
      items.push({
        kind: 'nav',
        label: item.label,
        href: toPortalHref(item.href, portalBasePath),
        icon: item.icon,
        group: 'Pages',
        flatIdx: idx++,
      });
    }

    // Data results
    for (const dr of dataResults) {
      const cfg = DATA_TYPE_CONFIG[dr.type] || DATA_TYPE_CONFIG.employee;
      const typeLabel = dr.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      items.push({
        kind: 'data',
        label: dr.title,
        subtitle: dr.subtitle,
        href: dr.href,
        icon: cfg.icon,
        iconColor: cfg.color,
        group: typeLabel + 's',
        meta: dr.meta,
        flatIdx: idx++,
      });
    }

    return items;
  }, [filteredNav, dataResults, portalBasePath]);

  // Group items for rendering
  const grouped = useMemo(() => {
    const groups: { label: string; items: typeof allItems }[] = [];
    const groupMap = new Map<string, typeof allItems>();

    for (const item of allItems) {
      if (!groupMap.has(item.group)) groupMap.set(item.group, []);
      groupMap.get(item.group)!.push(item);
    }

    for (const [label, items] of groupMap) {
      groups.push({ label, items });
    }
    return groups;
  }, [allItems]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setDataResults([]);
      setSearching(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [query, dataResults]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  const navigate = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [onClose, router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIdx]) navigate(allItems[selectedIdx].href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [allItems, selectedIdx, navigate, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[101] flex items-start justify-center pt-[12vh] px-4">
        <div
          className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-border overflow-hidden animate-slide-up"
          style={{ maxHeight: '70vh' }}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search employees, invoices, pages, and more…"
              className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
            {searching && (
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
            )}
            <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="sm:hidden w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 72px - 36px)' }}>
            {allItems.length === 0 && !searching ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <Search className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs mt-1 opacity-60">Try a different search term</p>
              </div>
            ) : allItems.length === 0 && searching ? (
              <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                <Loader2 className="w-8 h-8 mb-3 animate-spin opacity-30" />
                <p className="text-sm font-medium">Searching…</p>
              </div>
            ) : (
              <div className="p-2">
                {grouped.map(group => (
                  <div key={group.label} className="mb-1.5">
                    <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      {group.label}
                      <span className="text-[9px] font-normal opacity-60">
                        {group.items.length}
                      </span>
                    </p>
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isSelected = item.flatIdx === selectedIdx;
                      return (
                        <button
                          key={`${item.kind}-${item.flatIdx}`}
                          data-idx={item.flatIdx}
                          onClick={() => navigate(item.href)}
                          onMouseEnter={() => setSelectedIdx(item.flatIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-100 ${
                            isSelected
                              ? 'bg-primary/8 text-primary'
                              : 'text-foreground hover:bg-muted/60'
                          }`}
                        >
                          {/* Icon */}
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                              item.kind === 'data'
                                ? 'text-white shadow-sm'
                                : isSelected
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted/60 text-muted-foreground'
                            }`}
                            style={item.kind === 'data' ? { background: item.iconColor || 'hsl(220 65% 46%)' } : undefined}
                          >
                            <Icon className="w-4 h-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 text-left min-w-0">
                            <p className="font-medium truncate text-[13px]">{item.label}</p>
                            {item.subtitle && (
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                            )}
                          </div>

                          {/* Status badge for data results */}
                          {item.meta && item.kind === 'data' && (
                            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${
                              STATUS_COLORS[item.meta] || 'bg-gray-100 text-gray-600'
                            }`}>
                              {item.meta}
                            </span>
                          )}

                          {/* Enter hint for selected */}
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                              <CornerDownLeft className="w-3 h-3" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Loading indicator below results */}
                {searching && dataResults.length > 0 && (
                  <div className="flex items-center justify-center py-3 gap-2 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[11px]">Searching for more…</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-background border border-border rounded px-1 py-0.5">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-background border border-border rounded px-1 py-0.5">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-background border border-border rounded px-1 py-0.5">Esc</kbd>
              Close
            </span>
            {query.trim().length > 0 && (
              <span className="ml-auto opacity-60">
                {allItems.length} result{allItems.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
