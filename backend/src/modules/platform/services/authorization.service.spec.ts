import { AuthorizationService } from './authorization.service';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { GLOBAL_ACCESS_SCOPE } from '../../../shared/scope.util';

describe('AuthorizationService', () => {
  const positionService = {
    getUserPermissions: jest.fn(),
  };
  const hierarchyService = {
    getAccessScope: jest.fn(),
  };

  let service: AuthorizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthorizationService(positionService as any, hierarchyService as any);
    hierarchyService.getAccessScope.mockResolvedValue(GLOBAL_ACCESS_SCOPE);
  });

  it('allows organization admins to access all permissions regardless of position', async () => {
    const allowed = await service.can(
      { sub: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false, userType: 'org_admin' },
      PERMISSIONS.PAYROLL_VIEW,
    );

    expect(allowed).toBe(true);
    expect(positionService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('restricts branch admins to their assigned position permissions', async () => {
    positionService.getUserPermissions.mockResolvedValue([PERMISSIONS.RECRUITMENT_VIEW]);

    const user = { sub: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false, userType: 'branch_admin' as const };

    await expect(service.can(user, PERMISSIONS.RECRUITMENT_VIEW)).resolves.toBe(true);
    await expect(service.can(user, PERMISSIONS.PAYROLL_VIEW)).resolves.toBe(false);
    await expect(service.can(user, PERMISSIONS.FINANCE_INVOICES_VIEW)).resolves.toBe(false);
  });

  it('restricts admins to their assigned position permissions', async () => {
    positionService.getUserPermissions.mockResolvedValue([PERMISSIONS.FINANCE_INVOICES_VIEW]);

    const user = { sub: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false, userType: 'admin' as const };

    await expect(service.can(user, PERMISSIONS.FINANCE_INVOICES_VIEW)).resolves.toBe(true);
    await expect(service.can(user, PERMISSIONS.RECRUITMENT_VIEW)).resolves.toBe(false);
  });

  it('restricts employees to their assigned position permissions', async () => {
    positionService.getUserPermissions.mockResolvedValue([PERMISSIONS.LEAVE_VIEW]);

    const user = { sub: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false, userType: 'employee' as const };

    await expect(service.can(user, PERMISSIONS.LEAVE_VIEW)).resolves.toBe(true);
    await expect(service.can(user, PERMISSIONS.PAYROLL_VIEW)).resolves.toBe(false);
  });

  it('returns only position permissions for non-wildcard users', async () => {
    positionService.getUserPermissions.mockResolvedValue([PERMISSIONS.RECRUITMENT_VIEW]);

    const result = await service.getEffectivePermissions({
      sub: 'user-1',
      tenantId: 'tenant-1',
      isSuperAdmin: false,
      userType: 'branch_admin',
    });

    expect(result.permissions).toEqual([PERMISSIONS.RECRUITMENT_VIEW]);
  });
});
