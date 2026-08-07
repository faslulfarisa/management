import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompliancePolicyService } from './compliance-policy.service';

describe('CompliancePolicyService', () => {
  let db: { query: jest.Mock };
  let notifier: { emit: jest.Mock };
  let service: CompliancePolicyService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new CompliancePolicyService(db as any, notifier as any);
  });

  describe('publish()', () => {
    it('creates a pending acknowledgement row per active employee in scope and notifies them', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', title: 'Leave Policy', branch_id: null, current_version: 1 }] }); // doc
      db.query.mockResolvedValueOnce({ rows: [{ id: 'emp-1' }] }); // employees
      db.query.mockResolvedValueOnce({ rows: [] }); // INSERT ack for emp-1
      db.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] }); // users lookup

      const result = await service.publish('t1', 'doc-1', 'hr-1');

      expect(result).toEqual({ created: 1 });
      expect(db.query.mock.calls[2][0]).toContain('INSERT INTO compliance_policy_acknowledgements');
      expect(db.query.mock.calls[2][1]).toEqual(['t1', 'doc-1', 'emp-1', 1]);
      expect(notifier.emit).toHaveBeenCalledWith('t1', expect.objectContaining({ userIds: ['user-1'], entityId: 'doc-1' }));
    });

    it('throws when the policy document does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.publish('t1', 'missing', 'hr-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('acknowledge()', () => {
    it('upserts an acknowledged row at the document current version', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ current_version: 2 }] }); // doc lookup
      db.query.mockResolvedValueOnce({ rows: [{ id: 'ack-1', status: 'acknowledged' }] }); // upsert

      const result = await service.acknowledge('t1', 'doc-1', 'emp-1', '127.0.0.1');

      expect(result.status).toBe('acknowledged');
      const upsertCall = db.query.mock.calls[1];
      expect(upsertCall[1]).toEqual(['t1', 'doc-1', 'emp-1', 2, '127.0.0.1']);
    });
  });

  describe('listPendingForEmployee()', () => {
    it('rejects callers with no linked employee profile', async () => {
      await expect(service.listPendingForEmployee('t1', '' as any)).rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns pending acknowledgements for the given employee', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'ack-1', title: 'Leave Policy' }] });
      const result = await service.listPendingForEmployee('t1', 'emp-1');
      expect(result).toHaveLength(1);
      expect(db.query.mock.calls[0][1]).toEqual(['t1', 'emp-1']);
    });
  });
});
