import { ComplianceExpiryService } from './compliance-expiry.service';

describe('ComplianceExpiryService', () => {
  let db: { query: jest.Mock };
  let notifier: { emit: jest.Mock };
  let service: ComplianceExpiryService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new ComplianceExpiryService(db as any, notifier as any);
  });

  describe('runDailySweep()', () => {
    it('notifies every document crossing a threshold, deduping recipients, then runs the expired/renewal_pending transitions', async () => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'doc-1', tenant_id: 't1', title: 'Trade License', expiry_date: expiry.toISOString(),
          owner_id: 'owner-1', employee_user_id: 'owner-1', manager_user_id: null,
          branch_id: 'b1', department_id: null,
        }],
      }); // threshold query
      db.query.mockResolvedValueOnce({ rows: [] }); // renewal_pending UPDATE
      db.query.mockResolvedValueOnce({ rows: [] }); // expired UPDATE

      await service.runDailySweep();

      expect(notifier.emit).toHaveBeenCalledTimes(1);
      const [tenantId, payload] = notifier.emit.mock.calls[0];
      expect(tenantId).toBe('t1');
      expect(payload.userIds).toEqual(['owner-1']); // deduped (owner_id === employee_user_id)
      expect(payload.entityId).toBe('doc-1');
      expect(payload.sourceModule).toBe('compliance');

      expect(db.query.mock.calls[1][0]).toContain("status = 'renewal_pending'");
      expect(db.query.mock.calls[2][0]).toContain("status = 'expired'");
    });

    it('marks the notification high-priority once within 7 days of expiry', async () => {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 1);
      db.query.mockResolvedValueOnce({
        rows: [{ id: 'doc-2', tenant_id: 't1', title: 'Fire Safety Certificate', expiry_date: expiry.toISOString(), owner_id: null, employee_user_id: null, manager_user_id: null }],
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      await service.runDailySweep();

      const payload = notifier.emit.mock.calls[0][1];
      expect(payload.priority).toBe('high');
      expect(payload.userIds).toBeUndefined(); // no resolvable recipients -> tenant-wide broadcast
    });
  });
});
