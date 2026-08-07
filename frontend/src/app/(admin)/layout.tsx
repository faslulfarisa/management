'use client';

import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAtLeast } from '@/lib/hierarchy';
import { getCurrentPortalKind } from '@/lib/portal-host';

const SELECT_ORG_PATH = '/dashboard/select-org';

function isBranchScopedAdmin(userType?: string | null) {
  return userType === 'branch_admin' || userType === 'admin';
}


function toBranchAdminPath(pathname: string) {
  if (pathname === '/dashboard') return '/branch-admin';
  return pathname.replace(/^\/dashboard(?=\/)/, '/branch-admin');
}

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, tenants, selectedTenantId, _hydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const activeOrg = tenants.find((t) => t.id === selectedTenantId);
  const orgUnresolved = !!selectedTenantId && !activeOrg;
  const userType = activeOrg?.userType || 'employee';
  const isBranchAdmin = isBranchScopedAdmin(userType);
  const isAdmin = isAtLeast(userType, 'admin') || !!activeOrg?.isOrgAdmin;

  let isAuthorized = false;
  let redirectPath: string | null = null;

  if (_hydrated) {
    if (getCurrentPortalKind() === 'platform') {
      redirectPath = '/login';
    } else if (!accessToken) {
      redirectPath = '/login';
    } else if (!isAdmin && !orgUnresolved) {
      const employeeProfileRaw = typeof window !== 'undefined'
        ? localStorage.getItem('employee_profile')
        : null;
      const hasManagerProfile = employeeProfileRaw
        ? JSON.parse(employeeProfileRaw || '{}').is_manager === true
        : false;
      redirectPath = hasManagerProfile ? '/manager/dashboard' : '/home';
    } else if (!orgUnresolved && isBranchAdmin && pathname?.startsWith('/dashboard') && pathname !== SELECT_ORG_PATH) {
      redirectPath = toBranchAdminPath(pathname);
    } else if (!orgUnresolved && !isBranchAdmin && pathname?.startsWith('/branch-admin')) {
      redirectPath = '/dashboard';
    } else if (orgUnresolved && pathname !== SELECT_ORG_PATH) {
      redirectPath = SELECT_ORG_PATH;
    } else {
      isAuthorized = true;
    }
  }

  useEffect(() => {
    if (redirectPath) {
      router.push(redirectPath);
    }
  }, [redirectPath, router]);

  if (!_hydrated || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
