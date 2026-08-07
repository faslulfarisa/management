import { BadRequestException } from '@nestjs/common';
import { PayrollLockService } from './payroll-lock.service';

describe('PayrollLockService', () => {
  let db: { query: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: PayrollLockService;

  beforeEach(() => {
    db = { query: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PayrollLockService(db as any, auditLog as any);
  });

  describe('assertPeriodUnlocked()', () => {
    it('throws when the date falls inside a payroll_locked/payroll_processed summary', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 's1', period_start: '2026-01-01', period_end: '2026-01-31' }] });
      await expect(service.assertPeriodUnlocked('t1', 'emp-1', '2026-01-15')).rejects.toThrow(BadRequestException);
    });

    it('resolves silently when no locked summary covers the date', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.assertPeriodUnlocked('t1', 'emp-1', '2026-01-15')).resolves.toBeUndefined();
    });
  });

  describe('lock()', () => {
    it('rejects a blank reason without querying the database', async () => {
      await expect(service.lock('t1', 2026, 1, { type: 'organization' }, 'user-1', '   ')).rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('blocks locking while Draft/Pending Review summaries remain in scope', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ count: '2' }] }); // blockers
      await expect(
        service.lock('t1', 2026, 1, { type: 'organization' }, 'user-1', 'month-end close'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when no approved summaries match the scope', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // blockers
        .mockResolvedValueOnce({ rows: [] }); // UPDATE ... RETURNING (nothing approved)
      await expect(
        service.lock('t1', 2026, 1, { type: 'branch', branchId: 'b1' }, 'user-1', 'month-end close'),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks matching rows, returns the locked set, and audits each row', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ id: 's1', employee_id: 'e1' }, { id: 's2', employee_id: 'e2' }] });

      const result = await service.lock('t1', 2026, 1, { type: 'branch', branchId: 'b1' }, 'user-1', 'month-end close');

      expect(result).toEqual({ locked: 2, summaryIds: ['s1', 's2'], employeeIds: ['e1', 'e2'] });
      expect(auditLog.log).toHaveBeenCalledTimes(2);
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 't1', userId: 'user-1', entityType: 'attendance_summary', entityId: 's1', action: 'payroll_locked',
      }));
    });
  });

  describe('unlock()', () => {
    it('rejects a blank reason', async () => {
      await expect(service.unlock('t1', ['s1'], 'user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty id list', async () => {
      await expect(service.unlock('t1', [], 'user-1', 'reopening for correction')).rejects.toThrow(BadRequestException);
    });

    it('unlocks matching rows and audits each one', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 's1', employee_id: 'e1' }] });
      const result = await service.unlock('t1', ['s1'], 'user-1', 'reopening for correction');
      expect(result).toEqual({ unlocked: 1, employeeIds: ['e1'] });
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'payroll_unlocked', entityId: 's1' }));
    });

    it('throws when none of the given IDs are currently locked/processed', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.unlock('t1', ['s1'], 'user-1', 'reopening for correction')).rejects.toThrow(BadRequestException);
    });
  });
});
