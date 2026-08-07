'use client';

import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { EmployeeWebShell } from '@/components/employee/web/employee-web-shell';
import { PortalProfile } from '@/components/employee/desktop/portal-profile';
import { useAdminSection } from '@/hooks/use-admin-section';
import { useAuthStore } from '@/store/auth.store';
import { GlobalProfilePage } from './global-profile-page';
import { GlobalProfileShell } from './global-profile-shell';

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

export function ProfileRoute() {
  const { _hydrated, isInternalStaff, userType } = useAuthStore();
  const { isAdminDualContext, activeSection } = useAdminSection();

  if (!_hydrated) return <FullPageLoader />;

  const shouldUseEmployeeProfile =
    !isInternalStaff &&
    (userType === 'employee' || (isAdminDualContext && activeSection === 'my-space'));

  if (shouldUseEmployeeProfile) {
    return (
      <EmployeeGuard>
        <EmployeeWebShell>
          <PortalProfile />
        </EmployeeWebShell>
      </EmployeeGuard>
    );
  }

  return (
    <GlobalProfileShell>
      <GlobalProfilePage />
    </GlobalProfileShell>
  );
}
