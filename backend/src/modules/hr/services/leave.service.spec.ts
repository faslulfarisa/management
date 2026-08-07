import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService — createRequest balance enforcement', () => {
  let db: { query: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: LeaveService;

  const basePayload = {
    leave_type_id: 'lt-1',
    start_date: '2026-01-01',
    end_date: '2026-01-02', // 2 days inclusive
    reason: 'Family trip',
  };

  beforeEach(() => {
    db = { query: jest.fn() };
    approvalEngine = { submit: jest.fn().mockResolvedValue({ id: 'ar-1' }) };
    const payrollLock = { assertPeriodUnlocked: jest.fn().mockResolvedValue(undefined) };
    service = new LeaveService(db as any, {} as any, approvalEngine as any, payrollLock as any);
    
    // Mock the template policy methods so existing query test assertions remain clean and focused
    service['syncEmployeeBalances'] = jest.fn().mockResolvedValue(undefined);
    service['resolveLeavePolicy'] = jest.fn().mockResolvedValue({
      casual_leave_days: 12,
      sick_leave_days: 12,
      privilege_leave_days: 18,
      maternity_leave_days: 90,
      paternity_leave_days: 3,
      compensatory_off_enabled: true,
    });
  });

  it('blocks the request when no balance row exists for a paid leave type', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [] }); // leave_balances lookup -> none allocated

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(BadRequestException);
  });

  it('allows the request for an unpaid leave type with no balance row', async () => {
    // Bug-fix order: branch + user are resolved BEFORE the INSERT
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: false }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [] }) // leave_balances lookup -> none, but unpaid type is exempt
      .mockResolvedValueOnce({ rows: [{ branch_id: 'b1' }] }) // employees branch lookup (before INSERT)
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }) // resolveSubmitterUserId (before INSERT)
      .mockResolvedValueOnce({ rows: [{ id: 'lr-1', tenant_id: 't1', employee_id: 'emp-1', leave_type_id: 'lt-1', days: 2 }] }); // INSERT leave_requests

    const result = await service.createRequest('t1', 'emp-1', basePayload);

    expect(result.id).toBe('lr-1');
    expect(approvalEngine.submit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', workflowType: 'leave', entityId: 'lr-1', branchId: 'b1', submittedBy: 'user-1' }),
    );
  });

  it('blocks the request when requested days exceed the available balance', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [{ available: '1' }] }); // only 1 day available, 2 requested

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(BadRequestException);
  });

  it('blocks the request when every requested day is a paid holiday from the resolved holiday policy', async () => {
    const holidayPolicy = {
      blocksLeaveRequest: jest.fn().mockResolvedValue([{ name: 'New Year', date: '2026-01-01' }]),
    };
    const payrollLock = { assertPeriodUnlocked: jest.fn().mockResolvedValue(undefined) };
    service = new LeaveService(db as any, {} as any, approvalEngine as any, payrollLock as any, holidayPolicy as any);
    service['syncEmployeeBalances'] = jest.fn().mockResolvedValue(undefined);
    service['resolveLeavePolicy'] = jest.fn().mockResolvedValue({
      casual_leave_days: 12,
      sick_leave_days: 12,
      privilege_leave_days: 18,
    });

    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] })
      .mockResolvedValueOnce({ rows: [{ available: '5' }] });

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(
      'Leave is not required on paid holidays: New Year (2026-01-01)',
    );
    expect(holidayPolicy.blocksLeaveRequest).toHaveBeenCalledWith('t1', 'emp-1', '2026-01-01', '2026-01-02');
    expect(approvalEngine.submit).not.toHaveBeenCalled();
  });

  it('allows the request when a balance row covers the requested days and the employee has a branch', async () => {
    // Bug-fix order: branch + user are resolved BEFORE the INSERT
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [{ available: '5' }] }) // sufficient balance
      .mockResolvedValueOnce({ rows: [{ branch_id: 'b2' }] }) // employee branch lookup (before INSERT)
      .mockResolvedValueOnce({ rows: [{ id: 'user-2' }] }) // resolveSubmitterUserId (before INSERT)
      .mockResolvedValueOnce({ rows: [{ id: 'lr-2', tenant_id: 't1', employee_id: 'emp-1', leave_type_id: 'lt-1', days: 2 }] }); // INSERT leave_requests

    const result = await service.createRequest('t1', 'emp-1', basePayload);

    expect(result.id).toBe('lr-2');
    expect(approvalEngine.submit).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b2', submittedBy: 'user-2' }),
    );
  });

  it('throws before insert when the employee has no branch assigned', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [{ available: '5' }] }) // sufficient balance
      .mockResolvedValueOnce({ rows: [{ branch_id: null }] }); // employee branch lookup

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(
      'Employee must be assigned to a branch before submitting a leave request for approval',
    );

    expect(db.query).toHaveBeenCalledTimes(3);
    expect(approvalEngine.submit).not.toHaveBeenCalled();
  });

  it('throws BEFORE the INSERT when the employee has no linked user account (no orphaned row)', async () => {
    // Bug-fix verification: the error is now thrown before the INSERT so NO
    // leave_requests row is written to the DB when the user lookup fails.
    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CL', name: 'Casual Leave', gender_eligibility: 'all', paid: true }] }) // leave_types lookup
      .mockResolvedValueOnce({ rows: [{ available: '5' }] }) // sufficient balance
      .mockResolvedValueOnce({ rows: [{ branch_id: 'b1' }] }) // employees branch lookup
      .mockResolvedValueOnce({ rows: [] }); // resolveSubmitterUserId -> no linked user -> throws

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(BadRequestException);

    // The INSERT was never reached — only 4 queries fired, not 5
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(approvalEngine.submit).not.toHaveBeenCalled();
  });

  it('blocks the request when the leave type is not enabled by the assigned policy', async () => {
    service['resolveLeavePolicy'] = jest.fn().mockResolvedValue({
      casual_leave_days: 12,
      sick_leave_days: 12,
      privilege_leave_days: 18,
      maternity_leave_days: 90,
      compensatory_off_enabled: false,
    });

    db.query
      .mockResolvedValueOnce({ rows: [{ code: 'CO', name: 'Compensatory Off', gender_eligibility: 'all', paid: true }] }); // leave_types lookup

    await expect(service.createRequest('t1', 'emp-1', { ...basePayload, leave_type_id: 'lt-co' })).rejects.toThrow(
      'This leave type is not available under your assigned leave policy template.',
    );

    expect(approvalEngine.submit).not.toHaveBeenCalled();
  });

  it('blocks the request when no active leave policy template is assigned to the employee', async () => {
    // Override the mock to return null (no policy assigned)
    service['resolveLeavePolicy'] = jest.fn().mockResolvedValue(null);

    db.query
      .mockResolvedValueOnce({ rows: [{ gender_eligibility: 'all', paid: true }] }); // leave_types lookup

    await expect(service.createRequest('t1', 'emp-1', basePayload)).rejects.toThrow(
      'No active leave policy template has been assigned to you. Contact HR to assign a leave policy template before applying.'
    );
  });

  it('does not fall back to tenant default leave policy templates', async () => {
    service = new LeaveService(db as any, {} as any, approvalEngine as any, { assertPeriodUnlocked: jest.fn() } as any);
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await service['resolveLeavePolicy']('t1', 'emp-1');

    expect(result).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('FROM template_assignments');
  });

  it('shows active gender-eligible leave types in the dropdown even without a policy assignment', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ gender: 'female' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'lt-cl', code: 'CL', name: 'Casual Leave' },
          { id: 'lt-ml', code: 'ML', name: 'Maternity Leave' },
        ],
      });

    const result = await service.getLeaveTypes('t1', 'emp-1');

    expect(result).toEqual([
      { id: 'lt-cl', code: 'CL', name: 'Casual Leave' },
      { id: 'lt-ml', code: 'ML', name: 'Maternity Leave' },
    ]);
  });
});
