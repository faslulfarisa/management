'use client';

import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAtLeast } from '@/lib/hierarchy';

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
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!_hydrated) return;

    if (!accessToken) {
      router.push('/login');
      return;
    }

    const activeOrg = tenants.find((t) => t.id === selectedTenantId);

    // A tenant is selected but its details aren't in `tenants` yet — the
    // active organization context hasn't finished resolving. Treat this
    // separately from "not an admin" so we don't bounce the user to the
    // wrong portal while the org context is still loading.
    const orgUnresolved = !!selectedTenantId && !activeOrg;

    const userType = activeOrg?.userType || 'employee';
    const isBranchAdmin = isBranchScopedAdmin(userType);
    const isAdmin = isAtLeast(userType, 'admin') || !!activeOrg?.isOrgAdmin;

    if (!isAdmin && !orgUnresolved) {
      // Regular employee or manager — redirect to their portal
      const employeeProfileRaw = typeof window !== 'undefined'
        ? localStorage.getItem('employee_profile')
        : null;
      const hasManagerProfile = employeeProfileRaw
        ? JSON.parse(employeeProfileRaw || '{}').is_manager === true
        : false;

      router.push(hasManagerProfile ? '/manager/dashboard' : '/home');
      return;
    }

    if (!orgUnresolved && isBranchAdmin && pathname?.startsWith('/dashboard') && pathname !== SELECT_ORG_PATH) {
      router.push(toBranchAdminPath(pathname));
      return;
    }

    if (!orgUnresolved && !isBranchAdmin && pathname?.startsWith('/branch-admin')) {
      router.push('/dashboard');
      return;
    }

    if (orgUnresolved) {
      if (pathname !== SELECT_ORG_PATH) {
        router.push(SELECT_ORG_PATH);
        return;
      }
      setAuthorized(true);
      return;
    }

    setAuthorized(true);
  }, [_hydrated, accessToken, tenants, selectedTenantId, pathname, router]);

  if (!_hydrated || !authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
