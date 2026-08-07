'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, Briefcase, FileText, Users, GitBranch, Calendar, FileSignature, UserCheck,
  ClipboardList, Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Overview', href: '/dashboard/hr/recruitment', icon: LayoutGrid },
  { label: 'Vacancies', href: '/dashboard/hr/recruitment/vacancies', icon: Briefcase },
  { label: 'Job Descriptions', href: '/dashboard/hr/recruitment/job-descriptions', icon: FileText },
  { label: 'Candidates', href: '/dashboard/hr/recruitment/candidates', icon: Users },
  { label: 'Pipeline', href: '/dashboard/hr/recruitment/pipeline', icon: GitBranch },
  { label: 'Interviews', href: '/dashboard/hr/recruitment/interviews', icon: Calendar },
  { label: 'Offers', href: '/dashboard/hr/recruitment/offers', icon: FileSignature },
  { label: 'Onboarding', href: '/dashboard/hr/recruitment/onboarding', icon: UserCheck },
  { label: 'Workforce Planning', href: '/dashboard/hr/recruitment/workforce-planning', icon: ClipboardList },
  { label: 'Campaigns', href: '/dashboard/hr/recruitment/campaigns', icon: Megaphone },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard/hr/recruitment') return pathname === href;
  return pathname.startsWith(href);
}

export default function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-none w-fit max-w-full">
        {TABS.map(({ label, href, icon: Icon }) => {
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
