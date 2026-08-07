import { PerformanceController } from './performance.controller';

describe('PerformanceController — self-scope enforcement', () => {
  let service: { getKRAs: jest.Mock; getKPIs: jest.Mock; getReviews: jest.Mock };
  let db: { query: jest.Mock };
  let userHierarchyService: { getAccessScope: jest.Mock };
  let controller: PerformanceController;

  beforeEach(() => {
    service = { getKRAs: jest.fn().mockResolvedValue([]), getKPIs: jest.fn().mockResolvedValue([]), getReviews: jest.fn().mockResolvedValue([]) };
    db = { query: jest.fn() };
    userHierarchyService = { getAccessScope: jest.fn() };
    controller = new PerformanceController(service as any, db as any, userHierarchyService as any);
  });

  const req = (user: any) => ({ user } as any);

  it('overrides a spoofed employee_id with the caller\'s own id for a plain employee', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // no direct reports -> self scope

    await controller.getReviews(req({ userType: 'employee', employeeId: 'emp-1', tenantId: 't1' }), { employee_id: 'someone-elses-id' });

    expect(service.getReviews).toHaveBeenCalledWith('t1', expect.objectContaining({ employee_id: 'emp-1' }));
  });

  it('lets a manager view their own KRAs but not silently leak team data through this endpoint', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'report-1' }] }); // has direct reports -> team scope

    await controller.getKRAs(req({ userType: 'employee', employeeId: 'mgr-1', tenantId: 't1' }), { employee_id: 'report-1' });

    // report-1 is within the manager's team scope, so it's allowed through unchanged
    expect(service.getKRAs).toHaveBeenCalledWith('t1', expect.objectContaining({ employee_id: 'report-1' }));
  });

  it('rejects a manager attempting to view someone outside their team', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'report-1' }] });

    await controller.getKPIs(req({ userType: 'employee', employeeId: 'mgr-1', tenantId: 't1' }), { employee_id: 'stranger-id' });

    expect(service.getKPIs).toHaveBeenCalledWith('t1', expect.objectContaining({ employee_id: 'mgr-1' }));
  });

  it('does not restrict org_admin queries', async () => {
    await controller.getReviews(req({ userType: 'org_admin', tenantId: 't1' }), { employee_id: 'anyone' });

    expect(service.getReviews).toHaveBeenCalledWith('t1', expect.objectContaining({ employee_id: 'anyone' }));
    expect(db.query).not.toHaveBeenCalled();
  });
});
