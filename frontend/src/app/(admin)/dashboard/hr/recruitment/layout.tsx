'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Calendar,
  ClipboardList,
  FileSignature,
  FileText,
  GitBranch,
  LayoutGrid,
  Loader2,
  Megaphone,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { candidatesApi } from '@/lib/candidates-api';
import { vacanciesApi } from '@/lib/vacancies-api';
import { interviewsApi } from '@/lib/interviews-api';
import { offersApi } from '@/lib/offers-api';
import api from '@/lib/api';

const NAV_GROUPS = [
  {
    label: 'Start',
    items: [
      { label: 'Dashboard', href: '/dashboard/hr/recruitment', icon: LayoutGrid },
      { label: 'Workforce Planning', href: '/dashboard/hr/recruitment/workforce-planning', icon: ClipboardList },
    ],
  },
  {
    label: 'Plan & Publish',
    items: [
      { label: 'Vacancies', href: '/dashboard/hr/recruitment/vacancies', icon: Briefcase },
      { label: 'Job Descriptions', href: '/dashboard/hr/recruitment/job-descriptions', icon: FileText },
      { label: 'Campaigns', href: '/dashboard/hr/recruitment/campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'Select',
    items: [
      { label: 'Candidates', href: '/dashboard/hr/recruitment/candidates', icon: Users },
      { label: 'Pipeline', href: '/dashboard/hr/recruitment/pipeline', icon: GitBranch },
      { label: 'Interviews', href: '/dashboard/hr/recruitment/interviews', icon: Calendar },
    ],
  },
  {
    label: 'Hire',
    items: [
      { label: 'Offers', href: '/dashboard/hr/recruitment/offers', icon: FileSignature },
      { label: 'Onboarding', href: '/dashboard/hr/recruitment/onboarding', icon: UserCheck },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard/hr/recruitment') return pathname === href;
  return pathname.startsWith(href);
}

interface SearchResult {
  id: string;
  label: string;
  detail: string;
  href: string;
  type: 'Candidate' | 'Vacancy' | 'Interview' | 'Offer' | 'Recruiter' | 'Employee';
}

export default function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const trimmedQuery = query.trim();
  const showSearchResults = trimmedQuery.length >= 2;

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const [candidateResult, vacancyResult, interviewResult, offerResult, employeeResult] = await Promise.all([
          candidatesApi.list({ q: trimmedQuery, limit: 5 }).catch(() => ({ data: [], total: 0 })),
          vacanciesApi.list({ q: trimmedQuery, limit: 5, includeArchived: true }).catch(() => ({ data: [], total: 0 })),
          interviewsApi.list({ q: trimmedQuery, limit: 5 }).catch(() => ({ data: [], total: 0 })),
          offersApi.list({ q: trimmedQuery, limit: 5 }).catch(() => ({ data: [], total: 0 })),
          api.get('/employees', { params: { search: trimmedQuery, limit: 5 } })
            .then((r) => ({ data: Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data) ? r.data : [] }))
            .catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setResults([
          ...candidateResult.data.map((candidate): SearchResult => ({
            id: candidate.id,
            label: `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email,
            detail: candidate.email,
            href: `/dashboard/hr/recruitment/candidates/${candidate.id}`,
            type: 'Candidate',
          })),
          ...vacancyResult.data.map((vacancy): SearchResult => ({
            id: vacancy.id,
            label: vacancy.title,
            detail: [vacancy.department_name, vacancy.status?.replace(/_/g, ' ')].filter(Boolean).join(' - '),
            href: `/dashboard/hr/recruitment/vacancies/${vacancy.id}`,
            type: 'Vacancy',
          })),
          ...interviewResult.data.map((interview): SearchResult => ({
            id: interview.id,
            label: `${interview.first_name ?? ''} ${interview.last_name ?? ''}`.trim() || 'Interview',
            detail: [interview.vacancy_title, interview.round_type, interview.status].filter(Boolean).join(' - '),
            href: interview.application_id ? `/dashboard/hr/recruitment/pipeline/${interview.application_id}` : '/dashboard/hr/recruitment/interviews',
            type: 'Interview',
          })),
          ...offerResult.data.map((offer): SearchResult => ({
            id: offer.id,
            label: `${offer.first_name ?? ''} ${offer.last_name ?? ''}`.trim() || offer.designation || 'Offer',
            detail: [offer.vacancy_title || offer.job_title, offer.status?.replace(/_/g, ' ')].filter(Boolean).join(' - '),
            href: `/dashboard/hr/recruitment/offers/${offer.id}`,
            type: 'Offer',
          })),
          ...employeeResult.data.map((employee: any): SearchResult => {
            const label = [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.name || employee.email || 'Employee';
            const detail = [employee.employee_code, employee.department_name, employee.designation_name || employee.position_name].filter(Boolean).join(' - ');
            const isRecruiter = /recruit/i.test(`${detail} ${label}`);
            return {
              id: employee.id,
              label,
              detail: detail || employee.email || 'Employee profile',
              href: `/dashboard/hr/employees/${employee.id}`,
              type: isRecruiter ? 'Recruiter' : 'Employee',
            };
          }),
        ]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const currentStage = useMemo(() => {
    const group = NAV_GROUPS.find((item) => item.items.some((nav) => isActive(pathname, nav.href)));
    return group?.label || 'Control center';
  }, [pathname]);

  return (
    <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
      <div className="min-w-0 max-w-full rounded-lg border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recruitment workspace</p>
            <p className="text-sm font-semibold text-foreground">{currentStage}</p>
          </div>
          <div className="relative w-full min-w-0 xl:max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search candidates, vacancies, interviews, offers, recruiters..."
              className="w-full rounded-lg border border-border py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Global recruitment search"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {showSearchResults && (
              <div className="absolute right-0 top-11 z-30 w-full overflow-hidden rounded-lg border border-border bg-white shadow-xl">
                {searching ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">Searching...</div>
                ) : results.length ? (
                  <div className="max-h-80 overflow-y-auto py-1">
                    {results.map((result) => (
                      <Link
                        key={`${result.type}-${result.id}`}
                        href={result.href}
                        onClick={() => setQuery('')}
                        className="block px-3 py-2 hover:bg-muted"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-foreground">{result.label}</p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{result.type}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{result.detail}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No matching recruitment records.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <nav className="mt-3 min-w-0 max-w-full">
        <div className="hidden min-w-0 max-w-full flex-wrap gap-2 xl:flex">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg bg-muted/30 p-1">
              <span className="shrink-0 px-2 text-xs font-bold uppercase tracking-wide text-foreground">
                {group.label}
              </span>
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:hidden">
          {NAV_GROUPS.flatMap((group) => group.items).map(({ label, href, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
        </nav>
      </div>

      {children}
    </div>
  );
}
