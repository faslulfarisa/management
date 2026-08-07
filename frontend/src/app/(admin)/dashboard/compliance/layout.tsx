'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  LayoutGrid, Building2, FolderLock, ListChecks, FileBadge, Landmark,
  BookCheck, CalendarClock, RefreshCw, FileStack, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';

const TABS = [
  { label: 'Dashboard', href: '/dashboard/compliance', icon: LayoutGrid },
  { label: 'Company Documents', href: '/dashboard/compliance/company-documents', icon: Building2 },
  { label: 'Employee Documents', href: '/dashboard/compliance/employee-documents', icon: FolderLock, selfService: true },
  { label: 'Compliance Tracker', href: '/dashboard/compliance/tracker', icon: ListChecks },
  { label: 'Licenses & Certifications', href: '/dashboard/compliance/licenses-certifications', icon: FileBadge },
  { label: 'Government Registrations', href: '/dashboard/compliance/government-registrations', icon: Landmark },
  { label: 'Policy Management', href: '/dashboard/compliance/policies', icon: BookCheck, selfService: true },
  { label: 'Expiring Documents', href: '/dashboard/compliance/expiring', icon: CalendarClock },
  { label: 'Renewals', href: '/dashboard/compliance/renewals', icon: RefreshCw },
  { label: 'Document Templates', href: '/dashboard/compliance/templates', icon: FileStack },
  { label: 'Compliance Reports', href: '/dashboard/compliance/reports', icon: BarChart3 },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard/compliance') return pathname === href;
  return pathname.startsWith(href);
}

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const userType = useAuthStore((s) => s.userType);

  // Employee Documents / Policy Management stay visible to everyone (self-service vault +
  // policy acknowledgement); the rest is admin-tier (company docs, tracker, licenses, etc.)
  const tabs = useMemo(
    () => TABS.filter((t) => t.selfService || isAtLeast(userType, 'admin')),
    [userType],
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-none w-fit max-w-full">
        {tabs.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname ?? '', href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all',
                active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
