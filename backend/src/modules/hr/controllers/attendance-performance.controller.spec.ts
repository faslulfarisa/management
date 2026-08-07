import { AttendancePerformanceController } from './attendance-performance.controller';

describe('AttendancePerformanceController — RBAC scoping', () => {
  let db: { query: jest.Mock };
  let userHierarchyService: { getAccessScope: jest.Mock };
  let controller: AttendancePerformanceController;

  beforeEach(() => {
    db = { query: jest.fn() };
    userHierarchyService = { getAccessScope: jest.fn() };
    controller = new AttendancePerformanceController(db as any, userHierarchyService as any, {} as any, {} as any, {} as any);
  });

  const req = (user: any) => ({ user });

  it('scopes a plain employee with no direct reports to self-only', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // direct-reports lookup -> none
      .mockResolvedValueOnce({ rows: [{ id: 's1', employee_id: 'emp-1' }] }); // snapshots query

    const result = await controller.getSnapshots(req({ userType: 'employee', employeeId: 'emp-1', tenantId: 't1' }), { cycle_id: 'c1' });

    expect(result.data).toHaveLength(1);
    const [, snapshotParams] = db.query.mock.calls[1];
    expect(snapshotParams).toEqual(expect.arrayContaining([['emp-1']]));
  });

  it('returns no rows (without querying snapshots) for an employee with no linked employee record', async () => {
    const result = await controller.getSnapshots(req({ userType: 'employee', tenantId: 't1' }), { cycle_id: 'c1' });
    expect(result.data).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('scopes a manager with direct reports to self + team', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'report-1' }, { id: 'report-2' }] }) // direct reports
      .mockResolvedValueOnce({ rows: [] }); // snapshots query

    await controller.getSnapshots(req({ userType: 'employee', employeeId: 'mgr-1', tenantId: 't1' }), { cycle_id: 'c1' });

    const [, snapshotParams] = db.query.mock.calls[1];
    expect(snapshotParams[snapshotParams.length - 1]).toEqual(['mgr-1', 'report-1', 'report-2']);
  });

  it('grants org_admin org-wide scope with no employee/branch filter', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await controller.getSnapshots(req({ userType: 'org_admin', tenantId: 't1' }), { cycle_id: 'c1' });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(userHierarchyService.getAccessScope).not.toHaveBeenCalled();
  });

  it('restricts a branch_admin to their accessible branches', async () => {
    userHierarchyService.getAccessScope.mockResolvedValue({ isGlobalAccess: false, branchIds: ['b1', 'b2'] });
    db.query.mockResolvedValueOnce({ rows: [] });

    await controller.getSnapshots(req({ userType: 'branch_admin', tenantId: 't1' }), { cycle_id: 'c1' });

    const [, snapshotParams] = db.query.mock.calls[0];
    expect(snapshotParams).toEqual(expect.arrayContaining([['b1', 'b2']]));
  });

  it('excludes department/branch ranking from team-scoped summaries', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // direct reports -> none, so self scope
      .mockResolvedValueOnce({ rows: [{ avg_score: 80, avg_attendance_pct: 90, avg_compliance_pct: 95, total: 1 }] }) // avg
      .mockResolvedValueOnce({ rows: [] }) // top performers
      .mockResolvedValueOnce({ rows: [] }); // needs attention

    const result = await controller.getSummary(req({ userType: 'employee', employeeId: 'emp-1', tenantId: 't1' }), 'c1');

    expect(result.data.departmentRanking).toEqual([]);
    expect(result.data.branchRanking).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(4);
  });
});
