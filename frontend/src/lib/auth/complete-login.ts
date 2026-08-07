import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { isAtLeast } from '@/lib/hierarchy';
import { getCookieDomainAttribute } from '@/lib/portal-host';

export interface LoginResultData {
  accessToken: string;
  email?: string;
  tenants?: any[];
  isInternalStaff?: boolean;
  internalRole?: string | null;
  selectedTenantId?: string | null;
  pendingOrganization?: { id: string; name: string; approvalStatus: string; rejectionReason: string | null } | null;
}

interface MinimalRouter {
  push: (href: string) => void;
}

const LAST_SELECTED_TENANT_KEY_PREFIX = 'last_selected_tenant_id';

/**
 * Non-sensitive routing hint read by middleware.ts to keep platform and
 * customer sessions out of each other's route tree. Carries no auth secret —
 * the JWT (in the auth store) remains the only thing backend guards trust.
 */
function setPortalCookie(portal: 'platform' | 'customer') {
  document.cookie = `portal=${portal}; path=/; max-age=2592000; samesite=lax${getCookieDomainAttribute()}`;
}

function isBranchScopedAdmin(userType: string) {
  return userType === 'branch_admin' || userType === 'admin';
}

function getRememberedTenantId(email: string, tenants: any[]): string | null {
  if (typeof window === 'undefined') return null;

  const normalizedEmail = email.trim().toLowerCase();
  const tenantIds = new Set(tenants.map((tenant: any) => tenant.id));
  const resolveTenantId = (tenantId: string | null | undefined) =>
    tenantId && tenantIds.has(tenantId) ? tenantId : null;

  if (normalizedEmail) {
    const userTenantId = localStorage.getItem(`${LAST_SELECTED_TENANT_KEY_PREFIX}:${normalizedEmail}`);
    const rememberedUserTenantId = resolveTenantId(userTenantId);
    if (rememberedUserTenantId) return rememberedUserTenantId;
  }

  try {
    const lastActiveOrg = JSON.parse(localStorage.getItem('last_active_org') || 'null');
    const lastActiveOrgId = resolveTenantId(lastActiveOrg?.id);
    if (lastActiveOrgId) return lastActiveOrgId;
  } catch {
    localStorage.removeItem('last_active_org');
  }

  return resolveTenantId(localStorage.getItem(LAST_SELECTED_TENANT_KEY_PREFIX));
}

/**
 * Shared post-authentication routing, used after both a normal (no-MFA)
 * login and a successful MFA verification, so tenant resolution and
 * role-based landing-page routing live in exactly one place.
 */
export async function completeLogin(data: LoginResultData, email: string, router: MinimalRouter) {
  const {
    accessToken, tenants, isInternalStaff, internalRole,
    selectedTenantId, pendingOrganization,
  } = data;
  const accountEmail = data.email || email;

  const store = useAuthStore.getState();

  // Internal staff (Marketing/Sales/Technical) never have a tenant — route
  // them to the Operations Portal before any tenant-resolution logic below,
  // which would otherwise treat zero tenants as an error.
  if (isInternalStaff) {
    store.setAccessToken(accessToken);
    store.setUser({ email: accountEmail });
    store.setInternalStaff(true, internalRole ?? null);
    setPortalCookie('platform');
    router.push('/operations');
    return;
  }

  setPortalCookie('customer');

  // The user's only organization is still awaiting admin review.
  // send them to the status page instead of an empty dashboard.
  if (!(tenants?.length) && pendingOrganization) {
    router.push(`/register/pending?tenantId=${pendingOrganization.id}`);
    return;
  }

  store.setAccessToken(accessToken);
  store.setUser({ email: accountEmail });
  const availableTenants = tenants || [];
  store.setTenants(availableTenants);

  if (!selectedTenantId && !availableTenants.length) {
    throw new Error('No organizations found. Please contact your administrator.');
  }

  const rememberedTenantId = getRememberedTenantId(accountEmail, availableTenants);
  const serverSelectedTenantId = selectedTenantId && availableTenants.some((tenant: any) => tenant.id === selectedTenantId)
    ? selectedTenantId
    : null;
  const activeTenantId = serverSelectedTenantId || rememberedTenantId || availableTenants[0]?.id;

  if (!activeTenantId) {
    throw new Error('No organizations found. Please contact your administrator.');
  }

  if (activeTenantId === selectedTenantId) {
    store.selectTenant(activeTenantId, accessToken);
  } else {
    const selectRes = await api.post('/auth/select-tenant', { tenantId: activeTenantId });
    store.selectTenant(activeTenantId, selectRes.data.data.accessToken);
  }

  // Admin-tier users land in their dedicated desktop portal.
  const selectedOrg = availableTenants.find((t: any) => t.id === activeTenantId);
  const userType = selectedOrg?.userType || 'employee';
  if (isBranchScopedAdmin(userType)) {
    router.push('/branch-admin');
    return;
  }

  if (isAtLeast(userType, 'admin')) {
    router.push('/dashboard');
    return;
  }

  // Regular employee → mobile portal.
  // Eagerly try to cache their profile, but don't block routing on it —
  // EmployeeGuard will lazy-fetch it if this call fails (e.g. endpoint not yet live).
  try {
    const meRes = await api.get('/employees/me');
    store.setEmployeeProfile(meRes.data.data);
  } catch {
    // Profile will be fetched by EmployeeGuard on first page load
  }
  router.push('/home');
}
