'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { canOps, OPS_PERMISSIONS, type OpsPermission } from '@/lib/internal-roles';
import {
  LayoutDashboard, Network, Hourglass, ShieldOff, Archive, FileQuestion,
  CreditCard, Receipt, BarChart3, History,
  ChevronDown, X, UserCog, Gift, Database,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission: OpsPermission;
}

const organizationLinks: NavItem[] = [
  { label: 'All Organizations', href: '/operations/organizations', icon: Network, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
  { label: 'Pending Approvals', href: '/operations/organizations?stage=pending_approval', icon: Hourglass, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
  { label: 'Suspended Organizations', href: '/operations/organizations?stage=suspended', icon: ShieldOff, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
  { label: 'Archived Organizations', href: '/operations/organizations?stage=archived', icon: Archive, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
];

const administrationLinks: NavItem[] = [
  { label: 'Organization Requests', href: '/operations/requests', icon: FileQuestion, permission: OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE },
  { label: 'Subscription Management', href: '/operations/subscriptions', icon: CreditCard, permission: OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE },
  { label: 'Billing & Plans', href: '/operations/billing', icon: Receipt, permission: OPS_PERMISSIONS.BILLING_MANAGE_PLANS },
  { label: 'Staff Management', href: '/operations/staff', icon: UserCog, permission: OPS_PERMISSIONS.STAFF_MANAGE },
  { label: 'Signup Offers', href: '/operations/offers', icon: Gift, permission: OPS_PERMISSIONS.MARKETING_MANAGE_OFFERS },
  { label: 'Historical Imports', href: '/operations/historical-attendance-import', icon: Database, permission: OPS_PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_MONITOR },
];

const reportsLinks: NavItem[] = [
  { label: 'Organization Analytics', href: '/operations/reports/analytics', icon: BarChart3, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
  { label: 'Activity Logs', href: '/operations/reports/activity', icon: History, permission: OPS_PERMISSIONS.ORGANIZATIONS_VIEW },
];

function isLinkActive(pathname: string, search: string, href: string) {
  const [hrefPath, hrefQuery] = href.split('?');
  if (pathname !== hrefPath) return false;
  if (!hrefQuery) return !search;
  return search === `?${hrefQuery}`;
}

function NavSection({ title, items, pathname, search, internalRole, onNavigate }: {
  title: string;
  items: NavItem[];
  pathname: string;
  search: string;
  internalRole: string | null;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const visible = items.filter((item) => canOps(internalRole, item.permission));
  if (!visible.length) return null;

  return (
    <div>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center gap-2 px-3 py-1.5 group">
        <span className="w-0.5 h-3.5 rounded-full shrink-0 opacity-70 group-hover:opacity-100 transition-opacity ops-accent-bg" />
        <span className="text-[11px] font-bold tracking-widest uppercase text-white/75 group-hover:text-white/95 transition-colors">
          {title}
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-white/15 to-transparent" />
        <ChevronDown className={cn('w-3.5 h-3.5 text-white/50 group-hover:text-white/75 transition-all duration-200', collapsed && '-rotate-90')} />
      </button>

      {!collapsed && (
        <ul className="mt-0.5 space-y-0.5">
          {visible.map((item) => {
            const Icon = item.icon;
            const active = isLinkActive(pathname, search, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                    active ? 'ops-sidebar-active text-white shadow-lg shadow-black/20' : 'ops-sidebar-text hover:text-white hover:ops-sidebar-hover',
                  )}
                >
                  <span className={cn('flex items-center justify-center w-6 h-6 rounded-md transition-all', active ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10')}>
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

export function OperationsSidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname() ?? '/operations';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
  const { internalRole } = useAuthStore();
  const isDashboardActive = pathname === '/operations';

  return (
    <aside className={cn(
      'w-64 ops-sidebar-bg h-screen overflow-y-auto fixed left-0 top-0 flex flex-col z-30 transition-transform duration-300',
      isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    )}>
      <div className="px-5 py-5 border-b ops-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-lg ops-accent-bg">
            O
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">AI-HRMS Platform</p>
            <p className="text-[11px] ops-sidebar-text opacity-60 leading-tight">Platform Portal</p>
          </div>
        </div>
        <button onClick={onClose} className="md:hidden p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors" aria-label="Close menu">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        <div className="space-y-0.5">
          <Link
            href="/operations"
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
              isDashboardActive ? 'ops-sidebar-active text-white shadow-lg shadow-black/20' : 'ops-sidebar-text hover:text-white hover:ops-sidebar-hover',
            )}
          >
            <span className={cn('flex items-center justify-center w-6 h-6 rounded-md transition-all', isDashboardActive ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10')}>
              <LayoutDashboard className="w-3.5 h-3.5" />
            </span>
            <span className="truncate">Dashboard</span>
          </Link>
        </div>

        <NavSection title="Organizations" items={organizationLinks} pathname={pathname} search={search} internalRole={internalRole} />
        <NavSection title="Administration" items={administrationLinks} pathname={pathname} search={search} internalRole={internalRole} />
        <NavSection title="Reports" items={reportsLinks} pathname={pathname} search={search} internalRole={internalRole} />
      </nav>

      <div className="px-5 py-4 border-t ops-sidebar-border shrink-0">
        <p className="text-[10px] ops-sidebar-text opacity-40 text-center">AI-HRMS Platform Portal</p>
      </div>
    </aside>
  );
}
