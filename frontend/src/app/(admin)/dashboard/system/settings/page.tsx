'use client';

import Link from 'next/link';
import { Plug, Receipt, DollarSign, Shield, KeyRound, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const MODULES = [
  {
    href: '/dashboard/system/settings/integrations',
    label: 'Integrations',
    desc: 'ZKTeco, payment gateways, WhatsApp, and more.',
    icon: Plug,
    accent: 'from-sky-500 to-blue-600',
  },
  {
    href: '/dashboard/system/settings/guest-billing',
    label: 'Guest Billing',
    desc: 'Folios, room charges, and check-out invoices.',
    icon: Receipt,
    accent: 'from-amber-500 to-orange-600',
  },
  {
    href: '/dashboard/system/settings/saas-billing',
    label: 'SaaS Billing',
    desc: 'Subscription plan, invoices, and payments.',
    icon: DollarSign,
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    href: '/dashboard/system/settings/mfa',
    label: 'Multi-Factor Auth',
    desc: 'TOTP-based two-factor authentication.',
    icon: Shield,
    accent: 'from-violet-500 to-purple-600',
  },
  {
    href: '/dashboard/system/settings/sessions',
    label: 'Active Sessions',
    desc: 'Review and revoke active login sessions.',
    icon: KeyRound,
    accent: 'from-rose-500 to-pink-600',
  },
  {
    href: '/dashboard/system/settings/kpi',
    label: 'KPI Tracking',
    desc: 'Record and monitor performance indicators.',
    icon: BarChart3,
    accent: 'from-indigo-500 to-blue-700',
  },
];

export default function SettingsOverviewPage() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {MODULES.map(({ href, label, desc, icon: Icon, accent }) => (
        <Link key={href} href={href} className="group">
          <Card className="h-full transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 group-hover:border-primary/40">
            <CardContent className="p-5">
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
