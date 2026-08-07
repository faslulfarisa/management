'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { employeeApi } from '@/lib/employee-api';
import { resetOrgScopedState } from '@/lib/org-switch';
import { getCurrentPortalKind } from '@/lib/portal-host';

function getAdminPortalFromTenants(tenants: any[]) {
  const activeTenantId = localStorage.getItem('selected_tenant_id');
  const activeTenant = tenants.find((tenant: any) => tenant.id === activeTenantId) ?? tenants[0];
  if (activeTenant?.userType === 'branch_admin' || activeTenant?.userType === 'admin') {
    return '/branch-admin';
  }
  if (activeTenant?.isOrgAdmin || activeTenant?.userType === 'org_admin') {
    return '/dashboard';
  }
  return null;
}

export function EmployeeGuard({ children }: { children: React.ReactNode }) {
  const { accessToken, employeeProfile, setEmployeeProfile, _hydrated, logout } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  // No token at all — go to login
  useEffect(() => {
    if (_hydrated && getCurrentPortalKind() === 'platform') {
      router.push('/login');
      return;
    }

    if (_hydrated && !accessToken) {
      router.push('/login');
    }
  }, [_hydrated, accessToken, router]);

  // Fast-redirect admins to the desktop console immediately without triggering profile fetch.
  // Exception: if the admin has deliberately switched to "My Space" mode (stored in
  // sessionStorage as 'my-space'), we allow them to remain in the employee portal so they
  // can access their personal activities (attendance, leave, payroll, etc.).
  useEffect(() => {
    if (_hydrated && accessToken) {
      const tenants = JSON.parse(localStorage.getItem('tenants') || '[]');
      const adminPortal = getAdminPortalFromTenants(tenants);

      if (adminPortal) {
        const activeSection = typeof window !== 'undefined'
          ? sessionStorage.getItem('admin_active_section')
          : null;
        const isInMySpaceMode = activeSection === 'my-space';

        if (!isInMySpaceMode) {
          router.push(adminPortal);
        }
      }
    }
  }, [_hydrated, accessToken, router]);

  // Lazy-fetch employee profile on first load if it isn't in the store yet.
  // This handles the case where login happened before /employees/me existed,
  // or when localStorage was cleared but the access token is still valid.
  const { isLoading: loadingProfile, isError } = useQuery({
    queryKey: ['employee-profile-me'],
    queryFn: async () => {
      const profile = await employeeApi.getProfile();
      setEmployeeProfile(profile);
      return profile;
    },
    enabled: (() => {
      if (!_hydrated || !accessToken || employeeProfile) return false;
      // For admins in My Space mode, we still want to fetch the profile.
      // For admins NOT in My Space mode, skip (they'll be redirected above).
      const tenants = JSON.parse(localStorage.getItem('tenants') || '[]');
      const adminPortal = getAdminPortalFromTenants(tenants);
      if (!adminPortal) return true;
      const activeSection = typeof window !== 'undefined'
        ? sessionStorage.getItem('admin_active_section')
        : null;
      return activeSection === 'my-space';
    })(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  // Handle profile load failure (e.g. 404 Not Found)
  useEffect(() => {
    if (isError && _hydrated && accessToken) {
      const tenants = JSON.parse(localStorage.getItem('tenants') || '[]');
      const adminPortal = getAdminPortalFromTenants(tenants);

      if (adminPortal) {
        router.push(adminPortal);
      } else {
        // Regular user with an invalid/missing employee profile - clear session and redirect
        resetOrgScopedState(queryClient);
        logout();
        router.push('/login');
      }
    }
  }, [isError, _hydrated, accessToken, router, logout, queryClient]);

  // Still hydrating or actively fetching the profile for the first time
  if (!_hydrated || (!employeeProfile && loadingProfile)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // No token or error state
  if (!accessToken || (isError && !employeeProfile)) return null;

  return <>{children}</>;
}
