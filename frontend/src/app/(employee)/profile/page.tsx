'use client';

import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalProfile } from '@/components/employee/desktop/portal-profile';
// ── Mobile imports (original) ──────────────────────────────────
import { ProfileHeader } from '@/components/employee/profile/profile-header';
import { ProfileFieldSection } from '@/components/employee/profile/profile-field-section';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { LogOut, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { clearTenantScopedStorage } from '@/lib/org-switch';

export default function ProfilePage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileProfileContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalProfile />
      </div>
    </EmployeeGuard>
  );
}

function MobileProfileContent() {
  const { employeeProfile, logout } = useAuthStore();

  if (!employeeProfile) return null;

  const doj = employeeProfile.date_of_joining
    ? format(parseISO(employeeProfile.date_of_joining), 'd MMM yyyy')
    : null;

  return (
    <div className="flex flex-col pb-6">
      <ProfileHeader />

      <div className="px-4 space-y-5">
        <div className="space-y-5">
          <ProfileFieldSection
            title="Employment"
            fields={[
              { label: 'Branch',      value: employeeProfile.branch_name },
              { label: 'Department',  value: employeeProfile.department_name },
              { label: 'Designation', value: employeeProfile.designation_name },
              { label: 'Joined',      value: doj },
              { label: 'Reports To',  value: employeeProfile.reporting_manager_name },
            ]}
          />

          <ProfileFieldSection
            title="Contact"
            fields={[
              { label: 'Email', value: employeeProfile.email },
              { label: 'Phone', value: employeeProfile.phone },
            ]}
          />
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
              Quick Links
            </p>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {employeeProfile.is_manager && (
                <Link
                  href="/manager/dashboard"
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-amber-500/5 bg-amber-500/10 text-amber-600 font-semibold transition-colors"
                >
                  <span className="text-sm">Manager Portal</span>
                  <ChevronRight className="h-4 w-4 text-amber-600" />
                </Link>
              )}
              {[
                { label: 'My Payslips',   href: '/payslips'      },
                { label: 'My Documents',  href: '/documents'     },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-11 text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => {
              clearTenantScopedStorage();
              logout();
              window.location.href = '/login';
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
