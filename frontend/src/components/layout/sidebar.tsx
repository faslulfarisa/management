'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';
import {
  LayoutDashboard, Building2, Users, CalendarDays, Banknote, FileText,
  Settings, Briefcase, GraduationCap, BarChart3, Bell, Shield, DollarSign,
  CreditCard, KeyRound, Receipt, IndianRupee, ChevronDown,
  Fingerprint, Activity, AlertTriangle, GitPullRequest, Layers, GitBranch,
  ArrowRightLeft, BarChart2, ListChecks, TrendingUp, CheckSquare, AlertCircle,
  X, Clock, ClipboardList, SlidersHorizontal, LayoutGrid, UserX,
  ScrollText, User, CalendarCheck, Inbox, UserCircle, Award, DoorOpen, ClipboardCheck,
  Store, Landmark, Network, UserCog, UserPlus, CalendarClock, CalendarOff,
  CalendarRange, PartyPopper, CalendarX, BookOpenText, PieChart, ShieldCheck,
  History, Workflow, Monitor, Timer, Coffee, Coins, ListTodo, FileSpreadsheet, Percent
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { PERMISSIONS } from '@/lib/permissions';
import { PendingApprovalsWidget } from '@/components/approvals/pending-approvals-widget';
import { NotificationCenterWidget } from '@/components/notifications/notification-center-widget';
import { useAdminSection } from '@/hooks/use-admin-section';

const navGroups = [
  {
    label: 'Platform',
    items: [
      { label: 'Branches', href: '/dashboard/platform/branches', icon: GitBranch },
      { label: 'Departments', href: '/dashboard/platform/departments', icon: Building2 },
      { label: 'Areas', href: '/dashboard/platform/areas', icon: Layers },
      { label: 'Positions', href: '/dashboard/platform/positions', icon: Network },
      { label: 'User Management', href: '/dashboard/platform/users', icon: Users },
      { label: 'Approval Chains', href: '/dashboard/platform/approval-chains', icon: Workflow },
      { label: 'Audit Logs', href: '/dashboard/platform/audit-logs', icon: Shield },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Employees', href: '/dashboard/hr/employees', icon: UserCog },
      //{ label: 'Employee Transfers', href: '/dashboard/platform/transfers', icon: ArrowRightLeft },
      { label: 'Recruitment', href: '/dashboard/hr/recruitment', icon: UserPlus },
      { label: 'Attendance', href: '/dashboard/hr/attendance', icon: CalendarClock },
      { label: 'Leave', href: '/dashboard/hr/leave', icon: CalendarOff },
      { label: 'Payroll', href: '/dashboard/hr/payroll', icon: Banknote },
      { label: 'Fines & Deductions', href: '/dashboard/hr/fines', icon: AlertCircle },
      { label: 'Performance', href: '/dashboard/hr/performance', icon: TrendingUp },
      { label: 'Tasks', href: '/dashboard/hr/tasks', icon: ClipboardCheck },
      { label: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
      { label: 'Assets', href: '/dashboard/ops/assets', icon: Monitor },
      { label: 'Exit Management', href: '/dashboard/hr/exit-management', icon: KeyRound },
    ],
  },
  {
    label: 'Templates',
    items: [
      { label: 'Attendance Policy', href: '/dashboard/templates/attendance-policy', icon: Timer },
      { label: 'Break Policy', href: '/dashboard/templates/break-policy', icon: Coffee },
      { label: 'Leave Policy', href: '/dashboard/templates/leave-policy', icon: ClipboardList },
      { label: 'Salary Structure', href: '/dashboard/templates/salary-structure', icon: IndianRupee },
      { label: 'Overtime Policy', href: '/dashboard/templates/overtime-policy', icon: SlidersHorizontal },
      { label: 'Shift Templates', href: '/dashboard/templates/shifts', icon: CalendarRange },
      { label: 'Holiday Policy', href: '/dashboard/templates/holiday-policy', icon: PartyPopper },
    ],
  },
  {
    label: 'Schedules',
    items: [
      { label: 'Overview', href: '/dashboard/schedules/overview', icon: LayoutGrid },
      { label: 'All Assignments', href: '/dashboard/schedules/assignments', icon: ListTodo },
      { label: 'Unassigned', href: '/dashboard/schedules/unassigned', icon: UserX },
      { label: 'Shift Overrides', href: '/dashboard/hr/shifts/overrides', icon: CalendarX },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Overview', href: '/dashboard/finance', icon: DollarSign },
      { label: 'Expenses', href: '/dashboard/finance/expenses', icon: CreditCard },
      { label: 'Reimbursements', href: '/dashboard/finance/reimbursements', icon: Receipt },
      { label: 'Invoices', href: '/dashboard/finance/invoices', icon: FileText },
      { label: 'Vendors', href: '/dashboard/finance/vendors', icon: Store },
      { label: 'Vendor Bills', href: '/dashboard/finance/bills', icon: FileSpreadsheet },
      { label: 'Cashbook', href: '/dashboard/finance/cashbook', icon: BookOpenText },
      { label: 'Budgets', href: '/dashboard/finance/budgets', icon: PieChart },
      { label: 'GST Dashboard', href: '/dashboard/finance/gst', icon: Percent },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Overview', href: '/dashboard/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Biometrics',
    items: [
      { label: 'Live Attendance', href: '/dashboard/biometrics/live-attendance', icon: Activity },
      { label: 'Queue Health', href: '/dashboard/biometrics/queue-health', icon: Fingerprint },
      { label: 'Dead Letter', href: '/dashboard/biometrics/dlq', icon: AlertTriangle },
      { label: 'Corrections', href: '/dashboard/biometrics/corrections', icon: GitPullRequest },
      { label: 'Historical Imports', href: '/dashboard/biometrics/historical-attendance-import', icon: ScrollText },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/dashboard/system/settings', icon: Settings },
      { label: 'Company Profile', href: '/dashboard/settings/company-profile', icon: Landmark },
    ],
  },
];

const HIDE_FINANCE_SECTION = true;

/**
 * My Space navigation items — personal employee activities.
 * Rendered in the sidebar when an admin/branch_admin user switches to
 * the "My Space" operational context.
 */
const mySpaceNavItems = [
  { label: 'Dashboard', href: '/home', icon: LayoutDashboard },
  { label: 'My Attendance', href: '/attendance', icon: CalendarCheck },
  { label: 'My Leave', href: '/leave', icon: CalendarOff },
  { label: 'My Requests', href: '/requests', icon: Inbox },
  { label: 'My Schedule', href: '/shifts', icon: Clock },
  { label: 'My Performance', href: '/performance', icon: Award },
  { label: 'My Payroll', href: '/payslips', icon: Banknote },
  { label: 'My Documents', href: '/documents', icon: FileText },
  { label: 'My Exit', href: '/exit', icon: DoorOpen },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'My Profile', href: '/profile', icon: UserCircle },
];

const ITEM_PERMISSIONS: Record<string, string[]> = {
  '/dashboard/platform/branches': [PERMISSIONS.BRANCH_VIEW, PERMISSIONS.BRANCH_MANAGE],
  '/dashboard/platform/departments': [PERMISSIONS.BRANCH_VIEW, PERMISSIONS.BRANCH_MANAGE],
  '/dashboard/platform/areas': [PERMISSIONS.BRANCH_VIEW, PERMISSIONS.BRANCH_MANAGE],
  '/dashboard/platform/positions': [PERMISSIONS.PLATFORM_ROLES_VIEW],
  '/dashboard/platform/users': [PERMISSIONS.PLATFORM_USERS_VIEW],
  '/dashboard/platform/approval-chains': [PERMISSIONS.APPROVALS_VIEW, PERMISSIONS.APPROVALS_MANAGE],
  '/dashboard/platform/audit-logs': [PERMISSIONS.AUDIT_LOGS_VIEW],
  '/dashboard/hr/employees': [PERMISSIONS.EMPLOYEES_VIEW],
  '/dashboard/hr/recruitment': [PERMISSIONS.RECRUITMENT_VIEW],
  '/dashboard/hr/attendance': [PERMISSIONS.ATTENDANCE_VIEW],
  '/dashboard/biometrics/historical-attendance-import': [PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_MANAGE],
  '/dashboard/hr/leave': [PERMISSIONS.LEAVE_VIEW],
  '/dashboard/hr/payroll': [PERMISSIONS.PAYROLL_VIEW],
  '/dashboard/hr/fines': [PERMISSIONS.EMPLOYEES_VIEW],
  '/dashboard/hr/performance': [PERMISSIONS.PERFORMANCE_VIEW],
  '/dashboard/hr/tasks': [PERMISSIONS.TASKS_VIEW],
  '/dashboard/compliance': [PERMISSIONS.COMPLIANCE_VIEW],
  '/dashboard/ops/assets': [PERMISSIONS.ASSETS_VIEW],
  '/dashboard/hr/exit-management': [PERMISSIONS.EXIT_VIEW],
  '/dashboard/schedules/overview': [PERMISSIONS.SCHEDULES_VIEW],
  '/dashboard/schedules/assignments': [PERMISSIONS.SCHEDULES_VIEW],
  '/dashboard/schedules/unassigned': [PERMISSIONS.SCHEDULES_VIEW],
  '/dashboard/hr/shifts/overrides': [PERMISSIONS.SHIFT_OVERRIDE_VIEW],
  '/dashboard/templates/attendance-policy': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/break-policy': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/leave-policy': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/salary-structure': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/overtime-policy': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/shifts': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/templates/holiday-policy': [PERMISSIONS.PLATFORM_TEMPLATES_VIEW],
  '/dashboard/finance': [PERMISSIONS.FINANCE_INVOICES_VIEW, PERMISSIONS.FINANCE_BILLS_VIEW, PERMISSIONS.FINANCE_CASHBOOK_VIEW, PERMISSIONS.FINANCE_BUDGETS_VIEW],
  '/dashboard/finance/expenses': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/reimbursements': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/invoices': [PERMISSIONS.FINANCE_INVOICES_VIEW],
  '/dashboard/finance/vendors': [PERMISSIONS.FINANCE_VENDORS_MANAGE],
  '/dashboard/finance/bills': [PERMISSIONS.FINANCE_BILLS_VIEW],
  '/dashboard/finance/cashbook': [PERMISSIONS.FINANCE_CASHBOOK_VIEW],
  '/dashboard/finance/budgets': [PERMISSIONS.FINANCE_BUDGETS_VIEW],
  '/dashboard/finance/gst': [PERMISSIONS.GST_RETURNS_VIEW],
  '/dashboard/reports': [PERMISSIONS.REPORTS_VIEW],
  '/dashboard/biometrics/live-attendance': [PERMISSIONS.ATTENDANCE_VIEW],
  '/dashboard/biometrics/queue-health': [PERMISSIONS.ATTENDANCE_VIEW],
  '/dashboard/biometrics/dlq': [PERMISSIONS.ATTENDANCE_VIEW],
  '/dashboard/biometrics/corrections': [PERMISSIONS.ATTENDANCE_EDIT, PERMISSIONS.ATTENDANCE_APPROVE],
  '/dashboard/approvals': [PERMISSIONS.APPROVALS_VIEW],
  '/dashboard/notifications': [PERMISSIONS.NOTIFICATIONS_VIEW],
  '/dashboard/system/settings': [PERMISSIONS.ORGANIZATION_PROFILE_VIEW, PERMISSIONS.ORGANIZATION_PROFILE_EDIT],
  '/dashboard/settings/company-profile': [PERMISSIONS.ORGANIZATION_PROFILE_VIEW, PERMISSIONS.ORGANIZATION_PROFILE_EDIT],
};

function hasAnyPermission(granted: string[], required: string[]) {
  if (!required.length) return true;
  if (!granted.length) return false;
  return required.some((permission) => granted.includes(permission));
}

function isBranchScopedAdmin(userType: string) {
  return userType === 'branch_admin' || userType === 'admin';
}

function toPortalHref(href: string, portalBasePath: '/dashboard' | '/branch-admin') {
  if (portalBasePath === '/dashboard') return href;
  return href.replace(/^\/dashboard/, '/branch-admin');
}

function isHrefActive(href: string, pathname: string, allHrefs: string[]) {
  const isParent = allHrefs.some(h => h !== href && h.startsWith(href + '/') && pathname?.startsWith(h));
  return !isParent && (pathname === href || pathname?.startsWith(href + '/'));
}

function NavGroup({
  group,
  pathname,
  allHrefs,
  userType,
  accessConfig,
  permissions,
  portalBasePath,
}: {
  group: typeof navGroups[0];
  pathname: string;
  allHrefs: string[];
  userType: string;
  accessConfig: any;
  permissions: string[];
  portalBasePath: '/dashboard' | '/branch-admin';
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Filter items based on hierarchy rank (see frontend/src/lib/hierarchy.ts), then
  // apply any dynamic sidebar_access template restrictions on top.
  const visibleItems = group.items.filter(item => {
    if (group.label === 'Finance' && HIDE_FINANCE_SECTION) return false;

    let visible: boolean;

    if (item.href === '/dashboard/compliance') {
      // Compliance entry point is visible to everyone; the in-page tab bar
      // (see dashboard/compliance/layout.tsx) further restricts which tabs
      // a given role can see (self-service vault + policy acknowledgement
      // for employees, full module for admins).
      visible = true;
    } else if (item.href === '/dashboard/platform/users') {
      // User Management -> org_admin and above only.
      visible = isAtLeast(userType, 'org_admin');
    } else if (item.href === '/dashboard/platform/positions') {
      // Positions -> org_admin and branch-scoped admins.
      visible = isAtLeast(userType, 'admin');
    } else if (item.href === '/dashboard/platform/audit-logs') {
      // Audit Logs -> org_admin and above
      visible = isAtLeast(userType, 'org_admin');
    } else if (item.href?.startsWith('/dashboard/templates/')) {
      // Templates section -> org_admin and above
      visible = isAtLeast(userType, 'org_admin');
    } else if (item.href === '/dashboard/settings/company-profile') {
      // Company Profile -> org_admin and above
      visible = isAtLeast(userType, 'org_admin');
    } else if (item.href === '/dashboard/biometrics/historical-attendance-import') {
      visible = userType === 'org_admin' || permissions.includes(PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_MANAGE);
    } else if (item.href === '/dashboard/platform/branches' || item.href === '/dashboard/platform/approval-chains') {
      // Branches / Approval Chains -> org_admin and above fully, branch-scoped for branch_admin/admin
      visible = isAtLeast(userType, 'admin');
    } else if (group.label === 'Finance' || group.label === 'System') {
      // Finance / System -> org_admin and above only
      visible = isAtLeast(userType, 'org_admin');
    } else if (group.label === 'HR' || group.label === 'Schedules' || group.label === 'Reports' || group.label === 'Biometrics') {
      // HR, Schedules, Reports, Biometrics -> org_admin and above (full), branch_admin/admin (branch-scoped). Hidden for employee.
      visible = isAtLeast(userType, 'admin');
    } else {
      visible = true;
    }

    if (!visible) return false;
    if (!hasAnyPermission(permissions, ITEM_PERMISSIONS[item.href] || [])) return false;

    // Apply dynamic sidebar_access template config (further restricts branch/admin-level views)
    if (accessConfig) {
      if (group.label === 'HR' && accessConfig.show_hr_module === false) return false;
      if (group.label === 'Finance' && accessConfig.show_finance_module === false) return false;
      if (group.label === 'System' && accessConfig.show_system_module === false) return false;

      if (item.label === 'Payroll' && accessConfig.show_payroll === false) return false;
      if (item.label === 'Expenses' && accessConfig.show_expenses === false) return false;
      if (item.label === 'Invoices' && accessConfig.show_invoices === false) return false;
    }

    return true;
  });

  const hasActive = visibleItems.some((item) => isHrefActive(item.href, pathname, allHrefs));

  if (visibleItems.length === 0) return null;

  return (
    <div>
      {/* Group Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-3 py-1.5 group"
      >
        <span
          className="w-0.5 h-3.5 rounded-full shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
          style={{ background: 'linear-gradient(to bottom, hsl(43 90% 55%), hsl(35 95% 50%))' }}
        />
        <span className="text-[11px] font-bold tracking-widest uppercase text-white/75 group-hover:text-white/95 transition-colors">
          {group.label}
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-white/15 to-transparent" />
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-white/50 group-hover:text-white/75 transition-all duration-200',
            collapsed && '-rotate-90'
          )}
        />
      </button>

      {/* Items */}
      {!collapsed && (
        <ul className="mt-0.5 space-y-0.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = isHrefActive(item.href, pathname, allHrefs);
            return (
              <li key={item.href}>
                <Link
                  href={toPortalHref(item.href, portalBasePath)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'sidebar-active text-white shadow-lg shadow-black/20'
                      : 'sidebar-text hover:text-white hover:sidebar-hover'
                  )}
                >
                  <span className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                    isActive
                      ? 'bg-white/20'
                      : 'bg-white/5 group-hover:bg-white/10'
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { tenants, selectedTenantId, userType, permissions } = useAuthStore();
  const { isAdminDualContext, activeSection } = useAdminSection();
  const allHrefs = navGroups.flatMap(g => g.items.map(i => i.href));
  const normalizedPathname = pathname?.replace(/^\/branch-admin(?=\/|$)/, '/dashboard') ?? '';
  const portalBasePath = isBranchScopedAdmin(userType) || pathname?.startsWith('/branch-admin')
    ? '/branch-admin'
    : '/dashboard';

  const isMySpace = isAdminDualContext && activeSection === 'my-space';

  const currentOrg = tenants.find(t => t.id === selectedTenantId);

  const [accessConfig, setAccessConfig] = useState<any>(null);

  useEffect(() => {
    if (selectedTenantId) {
      api.get('/templates/my-sidebar').then(res => {
        if (res.data?.data?.config) {
          setAccessConfig(res.data.data.config);
        }
      }).catch(err => {
        console.error('Failed to fetch sidebar config', err);
      });
    }
  }, [selectedTenantId]);

  const topLevelHrefs = ['/dashboard/approvals', '/dashboard/notifications'];
  const isDashboardActive = normalizedPathname === '/dashboard' || (
    normalizedPathname.startsWith('/dashboard') &&
    !allHrefs.some(h => normalizedPathname.startsWith(h)) &&
    !topLevelHrefs.some(h => normalizedPathname.startsWith(h))
  );

  return (
    <aside className={cn(
      "w-64 sidebar-bg h-screen overflow-y-auto fixed left-0 top-0 flex flex-col z-30 transition-transform duration-300",
      isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
    )}>
      {/* Logo */}
      <div className="px-5 py-5 border-b sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg, hsl(43 90% 50%), hsl(35 95% 55%))' }}
          >
            H
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Ai-HRMS</p>
            <p className="text-[11px] sidebar-text opacity-60 leading-tight">Workforce Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold sidebar-text opacity-50">V-2.9</span>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Current org indicator */}
      {currentOrg && (
        <div className="px-4 py-3 border-b sidebar-border">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}
            >
              {currentOrg.name?.charAt(0)?.toUpperCase() || 'O'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate">{currentOrg.name}</p>
              <p className="text-[10px] sidebar-text opacity-50 truncate">{currentOrg.slug}</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {isMySpace ? (
          /* ── My Space Navigation ── */
          <div className="space-y-1">
            {/* Context badge */}
            <div
              className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(220 65% 55%))' }}
            >
              <User className="w-3.5 h-3.5" />
              My Space
            </div>
            {mySpaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'sidebar-active text-white shadow-lg shadow-black/20'
                      : 'sidebar-text hover:text-white hover:sidebar-hover',
                  )}
                >
                  <span className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                    isActive ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10',
                  )}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          /* ── Branch Management Navigation (existing) ── */
          <>
            <div className="space-y-0.5">
              <Link
                href={portalBasePath}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  isDashboardActive
                    ? 'sidebar-active text-white shadow-lg shadow-black/20'
                    : 'sidebar-text hover:text-white hover:sidebar-hover'
                )}
              >
                <span className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                  isDashboardActive
                    ? 'bg-white/20'
                    : 'bg-white/5 hover:bg-white/10'
                )}>
                  <LayoutDashboard className="w-3.5 h-3.5" />
                </span>
                <span className="truncate">Dashboard</span>
              </Link>

              {/* Approvals top-level link */}
              {hasAnyPermission(permissions, ITEM_PERMISSIONS['/dashboard/approvals']) && (() => {
                const isActive = normalizedPathname.startsWith('/dashboard/approvals');
                return (
                  <Link
                    href={toPortalHref('/dashboard/approvals', portalBasePath)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'sidebar-active text-white shadow-lg shadow-black/20'
                        : 'sidebar-text hover:text-white hover:sidebar-hover'
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                      isActive ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10'
                    )}>
                      <CheckSquare className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">Approvals</span>
                    <PendingApprovalsWidget />
                  </Link>
                );
              })()}

              {/* Notification Center top-level link */}
              {hasAnyPermission(permissions, ITEM_PERMISSIONS['/dashboard/notifications']) && (() => {
                const isActive = normalizedPathname.startsWith('/dashboard/notifications');
                return (
                  <Link
                    href={toPortalHref('/dashboard/notifications', portalBasePath)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'sidebar-active text-white shadow-lg shadow-black/20'
                        : 'sidebar-text hover:text-white hover:sidebar-hover'
                    )}
                  >
                    <span className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                      isActive ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10'
                    )}>
                      <Bell className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">Notification Center</span>
                    <NotificationCenterWidget />
                  </Link>
                );
              })()}
            </div>

            {navGroups.map((group) => (
              <NavGroup
                key={group.label}
                group={group}
                pathname={normalizedPathname}
                allHrefs={allHrefs}
                userType={userType}
                accessConfig={accessConfig}
                permissions={permissions}
                portalBasePath={portalBasePath}
              />
            ))}
          </>
        )}
      </nav>

      {/* Bottom brand badge */}
      <div className="px-5 py-4 border-t sidebar-border shrink-0">
        <p className="text-[10px] sidebar-text opacity-40 text-center">
          AI Human Resource Management
        </p>
      </div>
    </aside>
  );
}
