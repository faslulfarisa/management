'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Settings as SettingsIcon, Plug, Receipt, DollarSign, Shield, KeyRound, BarChart3,
} from 'lucide-react';

const TABS = [
  { label: 'Overview',      href: '/dashboard/system/settings',                icon: SettingsIcon, exact: true },
  { label: 'Integrations',  href: '/dashboard/system/settings/integrations',   icon: Plug },
  { label: 'Guest Billing', href: '/dashboard/system/settings/guest-billing',  icon: Receipt },
  { label: 'SaaS Billing',  href: '/dashboard/system/settings/saas-billing',   icon: DollarSign },
  { label: 'MFA',           href: '/dashboard/system/settings/mfa',            icon: Shield },
  { label: 'Sessions',      href: '/dashboard/system/settings/sessions',       icon: KeyRound },
  { label: 'KPI Tracking',  href: '/dashboard/system/settings/kpi',            icon: BarChart3 },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration and preferences</p>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ label, href, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
