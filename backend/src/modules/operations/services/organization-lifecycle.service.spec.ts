import { ConflictException } from '@nestjs/common';
import { OrganizationLifecycleService } from './organization-lifecycle.service';

describe('OrganizationLifecycleService upgraded subscription protection', () => {
  let db: { query: jest.Mock };
  let tenantService: { findOne: jest.Mock; remove: jest.Mock; update: jest.Mock; create: jest.Mock };
  let auditLog: { log: jest.Mock; findAll: jest.Mock; findAllByEntityType: jest.Mock };
  let hierarchyService: { setUserAccess: jest.Mock };
  let service: OrganizationLifecycleService;

  const actor = { sub: 'staff-1' };
  const tenant = {
    id: 'tenant-1',
    name: 'Acme Hotels',
    status: 'active',
    lifecycle_stage: 'active',
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    tenantService = {
      findOne: jest.fn().mockResolvedValue(tenant),
      remove: jest.fn().mockResolvedValue(tenant),
      update: jest.fn(),
      create: jest.fn(),
    };
    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn(),
      findAllByEntityType: jest.fn(),
    };
    hierarchyService = { setUserAccess: jest.fn() };
    service = new OrganizationLifecycleService(db as any, tenantService as any, auditLog as any, hierarchyService as any);
  });

  it('blocks deleting an organization with an active upgraded subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Growth' }] });

    await expect(service.remove('tenant-1', actor)).rejects.toThrow('Growth subscription');
    expect(tenantService.remove).not.toHaveBeenCalled();
  });

  it('does not remove or audit when delete is blocked by an active upgraded subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Growth' }] });

    await expect(service.remove('tenant-1', actor)).rejects.toThrow(ConflictException);

    expect(tenantService.remove).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('allows deleting when there is no active upgraded subscription', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.remove('tenant-1', actor);

    expect(result).toBe(tenant);
    expect(tenantService.remove).toHaveBeenCalledWith('tenant-1');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization_deleted' }));
  });

  it('blocks suspension before updating or auditing when active upgraded', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Enterprise' }] });

    await expect(service.suspend('tenant-1', actor)).rejects.toThrow('Enterprise subscription');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('t.trial_ends_at IS NULL OR t.trial_ends_at <= now()');
    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id');
    expect(db.query.mock.calls[0][0]).toContain("LOWER(COALESCE(sbp.slug, sp.slug, '')) NOT IN ('free', 'free-plan', 'free_plan')");
    expect(db.query.mock.calls[0][0]).not.toContain('COALESCE(ts.amount, 0) > 0');
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('blocks archival before updating or auditing when active upgraded', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Pro' }] });

    await expect(service.archive('tenant-1', actor)).rejects.toThrow('Pro subscription');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).not.toContain('UPDATE tenants');
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('allows suspension when the active subscription is a free plan or free trial', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...tenant, lifecycle_stage: 'suspended', status: 'suspended' }] });

    const result = await service.suspend('tenant-1', actor);

    expect(result.lifecycle_stage).toBe('suspended');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE tenants');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization_suspended' }));
  });

  it('blocks an upgraded subscription even when its current amount is zero', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Professional Plan' }] });

    await expect(service.archive('tenant-1', actor)).rejects.toThrow('Professional Plan subscription');

    expect(db.query.mock.calls[0][0]).not.toContain('COALESCE(ts.amount, 0) > 0');
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('checks both SaaS and legacy plan tables for upgraded subscriptions', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_name: 'Professional Plan' }] });

    await expect(service.suspend('tenant-1', actor)).rejects.toThrow('Professional Plan subscription');

    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN saas_base_plans sbp ON sbp.id = ts.plan_id');
    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id');
    expect(db.query.mock.calls[0][0]).toContain("COALESCE(sbp.name, sp.name, 'Upgraded')");
  });

  it('allows archival when there is no active subscription', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...tenant, lifecycle_stage: 'archived', status: 'suspended' }] });

    const result = await service.archive('tenant-1', actor);

    expect(result.lifecycle_stage).toBe('archived');
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization_archived' }));
  });
});
