import { ForbiddenException } from '@nestjs/common';
import { ApprovalEngineService } from './approval-engine.service';

describe('ApprovalEngineService', () => {
  let db: { query: jest.Mock };
  let chainService: { resolveChain: jest.Mock; computeAdvance: jest.Mock };
  let notificationService: {
    notifyNewRequest: jest.Mock;
    notifyStepAdvanced: jest.Mock;
    notifyResolved: jest.Mock;
  };
  let payrollLock: { assertPeriodUnlocked: jest.Mock };
  let engine: ApprovalEngineService;

  beforeEach(() => {
    db = { query: jest.fn() };
    chainService = {
      resolveChain: jest.fn(),
      // Mirrors BranchApprovalChainService.computeAdvance (pure logic, no DB access).
      computeAdvance: jest.fn((currentStep: number, approvedBy: string, chain: any, existingLog: any[]) => {
        const newLog = [...(existingLog || []), { step: currentStep, approved_by: approvedBy, approved_at: new Date().toISOString() }];
        if (!chain || !Array.isArray(chain.steps) || chain.steps.length === 0) {
          return { fullyApproved: true, nextStep: currentStep, newLog };
        }
        const sorted = [...chain.steps].sort((a: any, b: any) => a.step - b.step);
        const idx = sorted.findIndex((s: any) => s.step === currentStep);
        const next = sorted[idx + 1];
        return next
          ? { fullyApproved: false, nextStep: next.step, newLog }
          : { fullyApproved: true, nextStep: currentStep, newLog };
      }),
    };
    notificationService = {
      notifyNewRequest: jest.fn(),
      notifyStepAdvanced: jest.fn(),
      notifyResolved: jest.fn(),
    };
    payrollLock = { assertPeriodUnlocked: jest.fn().mockResolvedValue(undefined) };
    engine = new ApprovalEngineService(db as any, chainService as any, notificationService as any, payrollLock as any);
  });

  describe('submit() — approver fallback', () => {
    it('notifies org admins when no approval chain is configured for the branch', async () => {
      chainService.resolveChain.mockResolvedValue(null);
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'req-1', tenant_id: 't1', workflow_type: 'leave', entity_id: 'e1', entity_table: 'leave_requests', branch_id: 'b1', current_step: 1, status: 'pending' }],
        }) // INSERT approval_requests
        .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }, { id: 'admin-2' }] }); // org admin lookup

      await engine.submit({
        tenantId: 't1',
        workflowType: 'leave',
        entityId: 'e1',
        entityTable: 'leave_requests',
        submittedBy: 'emp-1',
        branchId: 'b1',
        title: 'Leave request: 2026-01-01 - 2026-01-02 (2 days)',
      });

      expect(notificationService.notifyNewRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1' }),
        ['admin-1', 'admin-2'],
      );
    });

    it('notifies org admins when the employee has no assigned branch', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 'req-2', tenant_id: 't1', workflow_type: 'leave', entity_id: 'e2', entity_table: 'leave_requests', branch_id: null, current_step: 1, status: 'pending' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'admin-1' }] });

      await engine.submit({
        tenantId: 't1',
        workflowType: 'leave',
        entityId: 'e2',
        entityTable: 'leave_requests',
        submittedBy: 'emp-2',
        branchId: null,
        title: 'Leave request',
      });

      expect(notificationService.notifyNewRequest).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-2' }),
        ['admin-1'],
      );
    });
  });

  describe('approveByEntity() — eligibility when no chain is configured', () => {
    const baseRequest = {
      id: 'req-1',
      tenant_id: 't1',
      status: 'pending',
      branch_id: 'b1',
      workflow_type: 'leave',
      current_step: 1,
      approval_log: [],
      entity_id: 'e1',
      entity_table: 'leave_requests',
      submitted_by: 'emp-1',
    };

    it('rejects a non-admin approver when no chain is configured (closes the "anyone can approve" hole)', async () => {
      chainService.resolveChain.mockResolvedValue(null);
      db.query
        .mockResolvedValueOnce({ rows: [baseRequest] }) // findByEntity
        .mockResolvedValueOnce({ rows: [{ role: 'branch_manager' }] }) // getActorRole
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_tenants
        .mockResolvedValueOnce({ rows: [] }); // isOrgAdmin: user_roles fallback

      await expect(
        engine.approveByEntity('e1', 'leave_requests', 't1', 'user-1', 'Looks good to me'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an org admin to approve even when no chain is configured', async () => {
      chainService.resolveChain.mockResolvedValue(null);
      db.query
        .mockResolvedValueOnce({ rows: [baseRequest] }) // findByEntity
        .mockResolvedValueOnce({ rows: [] }) // getActorRole (no branch_user_access row, irrelevant for admins)
        .mockResolvedValueOnce({ rows: [{ x: 1 }] }) // isOrgAdmin: user_tenants -> true
        .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', start_date: '2026-01-01', end_date: '2026-01-02' }] }) // assertPayrollUnlockedForEntity lookup
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'approved' }] }) // UPDATE approval_requests
        .mockResolvedValueOnce({ rows: [{ id: 'e1' }] }) // getEntity
        .mockResolvedValueOnce({ rows: [] }) // syncEntityStatus UPDATE
        .mockResolvedValueOnce({ rows: [] }); // getUserIdForSubmitter

      const result = await engine.approveByEntity('e1', 'leave_requests', 't1', 'admin-1', 'Approved, all good');
      expect(result.fullyApproved).toBe(true);
    });
  });

  describe('getPendingCount() — non-admin inbox query', () => {
    it('uses explicit lateral joins so branch_user_access can reference approval_requests', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_tenants
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_roles fallback
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // inbox count
        .mockResolvedValueOnce({ rows: [] }); // inbox data

      await expect(engine.getPendingCount('t1', 'user-1', false)).resolves.toBe(0);

      const countSql = db.query.mock.calls[2][0] as string;
      expect(countSql).toContain('JOIN LATERAL');
      expect(countSql).toContain(') chain ON true');
      expect(countSql).toContain(') step_info ON true');
      expect(countSql).not.toContain('FROM approval_requests ar,');
    });
  });

  describe('approveByEntity() — specific-approver steps', () => {
    const baseRequest = {
      id: 'req-1',
      tenant_id: 't1',
      status: 'pending',
      branch_id: 'b1',
      workflow_type: 'leave',
      current_step: 1,
      approval_log: [],
      entity_id: 'e1',
      entity_table: 'leave_requests',
      submitted_by: 'emp-1',
    };
    const chainWithNamedApprover = { steps: [{ step: 1, approver_id: 'approver-1' }] };

    it('rejects a user who is not the named approver, even if their branch role would otherwise match (closes the role-fallback hole)', async () => {
      chainService.resolveChain.mockResolvedValue(chainWithNamedApprover);
      db.query
        .mockResolvedValueOnce({ rows: [baseRequest] }) // findByEntity
        .mockResolvedValueOnce({ rows: [{ role: 'branch_manager' }] }) // getActorRole
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_tenants
        .mockResolvedValueOnce({ rows: [] }); // isOrgAdmin: user_roles fallback

      await expect(
        engine.approveByEntity('e1', 'leave_requests', 't1', 'some-other-user', 'Looks good to me'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the named approver to approve the step', async () => {
      chainService.resolveChain.mockResolvedValue(chainWithNamedApprover);
      db.query
        .mockResolvedValueOnce({ rows: [baseRequest] }) // findByEntity
        .mockResolvedValueOnce({ rows: [] }) // getActorRole
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_tenants
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_roles fallback
        .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', start_date: '2026-01-01', end_date: '2026-01-02' }] }) // assertPayrollUnlockedForEntity lookup
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'approved' }] }) // UPDATE approval_requests
        .mockResolvedValueOnce({ rows: [{ id: 'e1' }] }) // getEntity
        .mockResolvedValueOnce({ rows: [] }) // syncEntityStatus UPDATE
        .mockResolvedValueOnce({ rows: [] }); // getUserIdForSubmitter

      const result = await engine.approveByEntity('e1', 'leave_requests', 't1', 'approver-1', 'Approved, all good');
      expect(result.fullyApproved).toBe(true);
    });
  });

  describe('approveByEntity() — centralized payroll-lock guard', () => {
    const baseRequest = {
      id: 'req-1',
      tenant_id: 't1',
      status: 'pending',
      branch_id: 'b1',
      workflow_type: 'leave',
      current_step: 1,
      approval_log: [],
      entity_id: 'e1',
      entity_table: 'leave_requests',
      submitted_by: 'emp-1',
    };

    it('blocks full approval when the payroll period is locked, before any approval_requests/entity mutation', async () => {
      chainService.resolveChain.mockResolvedValue(null);
      payrollLock.assertPeriodUnlocked.mockRejectedValueOnce(new Error('Payroll for 2026-01-01 to 2026-01-31 is locked.'));
      db.query
        .mockResolvedValueOnce({ rows: [baseRequest] }) // findByEntity
        .mockResolvedValueOnce({ rows: [] }) // getActorRole
        .mockResolvedValueOnce({ rows: [{ x: 1 }] }) // isOrgAdmin: user_tenants -> true
        .mockResolvedValueOnce({ rows: [{ employee_id: 'emp-1', start_date: '2026-01-15', end_date: '2026-01-15' }] }); // date lookup

      await expect(
        engine.approveByEntity('e1', 'leave_requests', 't1', 'admin-1', 'Approved, all good'),
      ).rejects.toThrow('locked');

      expect(payrollLock.assertPeriodUnlocked).toHaveBeenCalledWith('t1', 'emp-1', '2026-01-15', '2026-01-15');
      expect(db.query).toHaveBeenCalledTimes(4); // never reached the UPDATE approval_requests step
    });
  });

  describe('cancel() — ownership check', () => {
    const pendingRequest = {
      id: 'req-1',
      tenant_id: 't1',
      status: 'pending',
      submitted_by: 'emp-owner',
      branch_id: 'b1',
      workflow_type: 'leave',
      current_step: 1,
      approval_log: [],
      entity_id: 'e1',
      entity_table: 'leave_requests',
    };

    it('rejects cancellation from a user who is neither the submitter nor an org admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [pendingRequest] }) // findOne
        .mockResolvedValueOnce({ rows: [] }) // getUserIdForSubmitter -> no match
        .mockResolvedValueOnce({ rows: [] }) // isOrgAdmin: user_tenants
        .mockResolvedValueOnce({ rows: [] }); // isOrgAdmin: user_roles fallback

      await expect(
        engine.cancel('req-1', 't1', 'some-other-user', 'changed my mind'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the original submitter to cancel their own request', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [pendingRequest] }) // findOne
        .mockResolvedValueOnce({ rows: [{ id: 'emp-owner' }] }) // getUserIdForSubmitter
        .mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'cancelled' }] }) // UPDATE approval_requests
        .mockResolvedValueOnce({ rows: [] }); // syncEntityStatus UPDATE

      const result = await engine.cancel('req-1', 't1', 'emp-owner', 'changed my mind');
      expect(result.status).toBe('cancelled');
    });
  });
});
