import { BadRequestException } from '@nestjs/common';
import { WorkforcePlanApprovalService } from './workforce-plan-approval.service';

describe('WorkforcePlanApprovalService — submit/approve/reject lifecycle sync', () => {
  let db: { query: jest.Mock };
  let approvalEngine: { submit: jest.Mock; approveByEntity: jest.Mock; rejectByEntity: jest.Mock };
  let auditLog: { log: jest.Mock };
  let plans: { getRaw: jest.Mock; activate: jest.Mock };
  let service: WorkforcePlanApprovalService;

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    approvalEngine = {
      submit: jest.fn().mockResolvedValue({ id: 'req-1' }),
      approveByEntity: jest.fn().mockResolvedValue({ fullyApproved: true }),
      rejectByEntity: jest.fn().mockResolvedValue({ fullyApproved: false }),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    plans = { getRaw: jest.fn(), activate: jest.fn().mockResolvedValue({ id: 'plan-1', status: 'active' }) };
    service = new WorkforcePlanApprovalService(db as any, approvalEngine as any, auditLog as any, plans as any);
  });

  describe('submit', () => {
    it('rejects submitting a plan that is not draft or rejected', async () => {
      plans.getRaw.mockResolvedValue({ id: 'plan-1', tenant_id: 't1', status: 'active', title: 'FY27 Plan', year: 2027 });

      await expect(service.submit('t1', 'plan-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(approvalEngine.submit).not.toHaveBeenCalled();
    });

    it('moves a draft plan to pending_approval and submits it to the approval engine', async () => {
      plans.getRaw.mockResolvedValue({ id: 'plan-1', tenant_id: 't1', status: 'draft', title: 'FY27 Plan', year: 2027, branch_id: 'b1' });

      const result = await service.submit('t1', 'plan-1', 'user-1');

      expect(result).toEqual({ id: 'req-1' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = 'pending_approval', approval_status = 'pending'`),
        ['plan-1', 't1'],
      );
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't1', workflowType: 'workforce_plan', entityId: 'plan-1', entityTable: 'workforce_plans', branchId: 'b1' }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit_for_approval', entityType: 'workforce_plan' }));
    });
  });

  describe('approve', () => {
    it('activates the plan once the approval engine reports the entity as fully approved', async () => {
      plans.getRaw.mockResolvedValue({ id: 'plan-1', tenant_id: 't1', status: 'pending_approval', approval_status: 'approved' });

      await service.approve('t1', 'plan-1', 'approver-1', 'Looks good');

      expect(approvalEngine.approveByEntity).toHaveBeenCalledWith('plan-1', 'workforce_plans', 't1', 'approver-1', 'Looks good', undefined, undefined);
      expect(plans.activate).toHaveBeenCalledWith('plan-1', 't1');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }));
    });

    it('does not activate the plan mid-chain (still pending_approval but engine not yet fully resolved)', async () => {
      plans.getRaw.mockResolvedValue({ id: 'plan-1', tenant_id: 't1', status: 'pending_approval', approval_status: 'under_review' });

      await service.approve('t1', 'plan-1', 'approver-1', 'Step 1 ok');

      expect(plans.activate).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('marks the plan rejected once the approval engine rejects it', async () => {
      plans.getRaw.mockResolvedValue({ id: 'plan-1', tenant_id: 't1', status: 'pending_approval', approval_status: 'rejected' });

      await service.reject('t1', 'plan-1', 'approver-1', 'Budget too high');

      expect(approvalEngine.rejectByEntity).toHaveBeenCalledWith('plan-1', 'workforce_plans', 't1', 'approver-1', 'Budget too high', undefined);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = 'rejected'`),
        ['plan-1', 't1'],
      );
      expect(plans.activate).not.toHaveBeenCalled();
    });
  });
});
