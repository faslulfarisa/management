import { create } from 'zustand';
import type { EmployeeProfile } from '@/types/employee';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  status: string;
  isOrgAdmin: boolean;
  userType: string;
}

export interface AccessScope {
  isGlobalAccess: boolean;
  branchIds: string[];
}

export const DEFAULT_ACCESS_SCOPE: AccessScope = { isGlobalAccess: false, branchIds: [] };

interface AuthState {
  user: any | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  tenants: TenantInfo[];
  selectedTenantId: string | null;
  activeOrganization: TenantInfo | null;
  userType: string;
  isInternalStaff: boolean;
  internalRole: string | null;
  employeeProfile: EmployeeProfile | null;
  permissions: string[];
  accessScope: AccessScope;
  _hydrated: boolean;
  setUser: (user: any | null) => void;
  setAccessToken: (token: string | null) => void;
  setTenants: (tenants: TenantInfo[]) => void;
  selectTenant: (tenantId: string, token: string, tenants?: TenantInfo[]) => void;
  setInternalStaff: (isInternalStaff: boolean, internalRole: string | null) => void;
  setEmployeeProfile: (profile: EmployeeProfile | null) => void;
  setPermissions: (permissions: string[], accessScope: AccessScope) => void;
  logout: () => void;
  hydrate: () => void;
}

function deriveActiveOrg(tenants: TenantInfo[], selectedTenantId: string | null): TenantInfo | null {
  if (!selectedTenantId) return null;
  return tenants.find((t) => t.id === selectedTenantId) ?? null;
}

function deriveUserType(activeOrganization: TenantInfo | null): string {
  return activeOrganization?.userType || 'employee';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  tenants: [],
  selectedTenantId: null,
  activeOrganization: null,
  userType: 'employee',
  isInternalStaff: false,
  internalRole: null,
  employeeProfile: null,
  permissions: [],
  accessScope: DEFAULT_ACCESS_SCOPE,
  _hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');
    const tenants: TenantInfo[] = JSON.parse(localStorage.getItem('tenants') || '[]');
    const selectedTenantId = localStorage.getItem('selected_tenant_id');
    const isInternalStaff = localStorage.getItem('is_internal_staff') === 'true';
    const internalRole = localStorage.getItem('internal_role');
    const employeeProfileRaw = localStorage.getItem('employee_profile');
    const employeeProfile = employeeProfileRaw ? JSON.parse(employeeProfileRaw) : null;
    const permissions: string[] = JSON.parse(localStorage.getItem('permissions') || '[]');
    const accessScopeRaw = localStorage.getItem('access_scope');
    const accessScope: AccessScope = accessScopeRaw ? JSON.parse(accessScopeRaw) : DEFAULT_ACCESS_SCOPE;
    const activeOrganization = deriveActiveOrg(tenants, selectedTenantId);
    set({
      accessToken: token,
      tenants,
      selectedTenantId,
      activeOrganization,
      userType: deriveUserType(activeOrganization),
      isInternalStaff,
      internalRole,
      employeeProfile,
      permissions,
      accessScope,
      _hydrated: true,
    });
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setAccessToken: (token) => {
    if (token) localStorage.setItem('access_token', token);
    else localStorage.removeItem('access_token');
    set({ accessToken: token });
  },

  setTenants: (tenants) => {
    localStorage.setItem('tenants', JSON.stringify(tenants));
    const { selectedTenantId } = get();
    const activeOrganization = deriveActiveOrg(tenants, selectedTenantId);
    set({ tenants, activeOrganization, userType: deriveUserType(activeOrganization) });
  },

  selectTenant: (tenantId, token, tenants?) => {
    localStorage.setItem('selected_tenant_id', tenantId);
    localStorage.setItem('access_token', token);
    const resolvedTenants = tenants ?? get().tenants;
    if (tenants) localStorage.setItem('tenants', JSON.stringify(tenants));
    const activeOrganization = deriveActiveOrg(resolvedTenants, tenantId);
    if (activeOrganization) {
      localStorage.setItem('last_active_org', JSON.stringify(activeOrganization));
    }
    // Clear stale permissions from the previous org context immediately —
    // PermissionsSync re-fetches them for the newly selected tenant.
    localStorage.removeItem('permissions');
    localStorage.removeItem('access_scope');
    set({
      selectedTenantId: tenantId,
      accessToken: token,
      tenants: resolvedTenants,
      activeOrganization,
      userType: deriveUserType(activeOrganization),
      permissions: [],
      accessScope: DEFAULT_ACCESS_SCOPE,
    });
  },

  setInternalStaff: (isInternalStaff, internalRole) => {
    localStorage.setItem('is_internal_staff', isInternalStaff ? 'true' : 'false');
    if (internalRole) localStorage.setItem('internal_role', internalRole);
    else localStorage.removeItem('internal_role');
    set({ isInternalStaff, internalRole });
  },

  setEmployeeProfile: (profile) => {
    if (profile) localStorage.setItem('employee_profile', JSON.stringify(profile));
    else localStorage.removeItem('employee_profile');
    set({ employeeProfile: profile });
  },

  setPermissions: (permissions, accessScope) => {
    localStorage.setItem('permissions', JSON.stringify(permissions));
    localStorage.setItem('access_scope', JSON.stringify(accessScope));
    set({ permissions, accessScope });
  },

  logout: () => {
    document.cookie = 'portal=; path=/; max-age=0';
    localStorage.removeItem('access_token');
    localStorage.removeItem('tenants');
    localStorage.removeItem('selected_tenant_id');
    localStorage.removeItem('is_internal_staff');
    localStorage.removeItem('internal_role');
    localStorage.removeItem('employee_profile');
    localStorage.removeItem('permissions');
    localStorage.removeItem('access_scope');
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      tenants: [],
      selectedTenantId: null,
      activeOrganization: null,
      userType: 'employee',
      isInternalStaff: false,
      internalRole: null,
      employeeProfile: null,
      permissions: [],
      accessScope: DEFAULT_ACCESS_SCOPE,
    });
  },
}));
