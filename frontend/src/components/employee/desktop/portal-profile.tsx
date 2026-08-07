'use client';

import { useAuthStore } from '@/store/auth.store';
import { format, parseISO } from 'date-fns';
import { LogOut, ChevronRight, User, Briefcase, Phone, Calendar, Users } from 'lucide-react';
import Link from 'next/link';
import { clearTenantScopedStorage } from '@/lib/org-switch';
import { cn } from '@/lib/utils';

export function PortalProfile() {
  const { employeeProfile, logout } = useAuthStore();

  if (!employeeProfile) return null;

  const doj = employeeProfile.date_of_joining
    ? format(parseISO(employeeProfile.date_of_joining), 'd MMM yyyy')
    : '—';

  const initials =
    [employeeProfile.first_name?.[0], employeeProfile.last_name?.[0]]
      .filter(Boolean).join('').toUpperCase() || 'E';

  const employmentFields = [
    { Icon: Briefcase, label: 'Department',    value: employeeProfile.department_name  },
    { Icon: User,      label: 'Designation',   value: employeeProfile.designation_name },
    { Icon: Users,     label: 'Branch',         value: employeeProfile.branch_name      },
    { Icon: Calendar,  label: 'Date of Joining',value: doj                              },
    { Icon: User,      label: 'Reports To',     value: employeeProfile.reporting_manager_name },
  ];

  const contactFields = [
    { label: 'Email',  value: employeeProfile.email },
    { label: 'Phone',  value: employeeProfile.phone ?? '—' },
    { label: 'Emp. Code', value: employeeProfile.employee_code },
  ];

  const quickLinks = [
    ...(employeeProfile.is_manager ? [{ label: 'Manager Portal', href: '/manager/dashboard', highlight: true }] : []),
    { label: 'My Payslips',   href: '/payslips'      },
    { label: 'My Documents',  href: '/documents'     },
    { label: 'My Leave',      href: '/leave'         },
  ];

  return (
    <div>
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="p-6 max-w-[1000px]">
        {/* Profile hero card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5 flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {employeeProfile.first_name} {employeeProfile.last_name}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {employeeProfile.designation_name ?? employeeProfile.department_name}
              {employeeProfile.branch_name ? ` · ${employeeProfile.branch_name}` : ''}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {employeeProfile.employee_code}
              </span>
              <span className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                employeeProfile.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : employeeProfile.status === 'probation'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-gray-100 text-gray-500',
              )}>
                {employeeProfile.status.charAt(0).toUpperCase() + employeeProfile.status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Employment details */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Employment</p>
              </div>
              <div className="divide-y divide-gray-50">
                {employmentFields.map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-5 py-3">
                    <Icon className="h-4 w-4 text-gray-300 shrink-0" />
                    <p className="text-[12px] text-gray-400 w-32 shrink-0">{label}</p>
                    <p className="text-[13px] font-medium text-gray-800">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contact</p>
              </div>
              <div className="divide-y divide-gray-50">
                {contactFields.map(({ label, value }) => (
                  <div key={label} className="flex items-center px-5 py-3">
                    <p className="text-[12px] text-gray-400 w-32 shrink-0">{label}</p>
                    <p className="text-[13px] font-medium text-gray-800">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: quick links */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Quick Links</p>
              </div>
              <div className="divide-y divide-gray-50">
                {quickLinks.map(({ label, href, highlight }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center justify-between px-5 py-3 transition-colors',
                      highlight
                        ? 'hover:bg-amber-50 bg-amber-50/50'
                        : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('text-[13px] font-medium', highlight ? 'text-amber-700' : 'text-gray-700')}>
                      {label}
                    </span>
                    <ChevronRight className={cn('h-3.5 w-3.5', highlight ? 'text-amber-500' : 'text-gray-300')} />
                  </Link>
                ))}
              </div>
            </div>

            <button
              onClick={() => { clearTenantScopedStorage(); logout(); window.location.href = '/login'; }}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-500 hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors shadow-sm"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
