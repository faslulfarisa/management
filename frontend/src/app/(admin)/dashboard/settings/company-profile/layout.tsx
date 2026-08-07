'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2, Phone, MapPin, Palette, FileText, Banknote, SlidersHorizontal,
} from 'lucide-react';

const TABS = [
  { label: 'General',    href: '/dashboard/settings/company-profile/general',    icon: Building2 },
  { label: 'Contact',    href: '/dashboard/settings/company-profile/contact',    icon: Phone },
  { label: 'Addresses',  href: '/dashboard/settings/company-profile/addresses',  icon: MapPin },
  { label: 'Branding',   href: '/dashboard/settings/company-profile/branding',   icon: Palette },
  { label: 'Documents',  href: '/dashboard/settings/company-profile/documents',  icon: FileText },
  { label: 'Finance',    href: '/dashboard/settings/company-profile/finance',    icon: Banknote },
  { label: 'Operations', href: '/dashboard/settings/company-profile/operations', icon: SlidersHorizontal },
];

export default function CompanyProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Company Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your organisation&apos;s identity, branding, and configuration</p>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
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
