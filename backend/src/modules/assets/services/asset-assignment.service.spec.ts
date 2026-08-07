import { NotFoundException } from '@nestjs/common';
import { AssetAssignmentService } from './asset-assignment.service';

describe('AssetAssignmentService', () => {
  let db: { query: jest.Mock };
  let assetItemService: { assertAvailable: jest.Mock; setStatus: jest.Mock };
  let service: AssetAssignmentService;

  beforeEach(() => {
    db = { query: jest.fn() };
    assetItemService = {
      assertAvailable: jest.fn().mockResolvedValue({ id: 'item-1', status: 'available' }),
      setStatus: jest.fn().mockResolvedValue(undefined),
    };
    service = new AssetAssignmentService(db as any, assetItemService as any);
  });

  describe('assign()', () => {
    it('rejects assigning an asset that is not available', async () => {
      assetItemService.assertAvailable.mockRejectedValueOnce(new Error('not available'));
      await expect(
        service.assign('t1', { asset_item_id: 'item-1', employee_id: 'emp-1' }, 'user-1'),
      ).rejects.toThrow();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('creates the assignment and marks the asset item as assigned', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'assignment-1', status: 'active' }] });
      const result = await service.assign('t1', { asset_item_id: 'item-1', employee_id: 'emp-1' }, 'user-1');
      expect(result).toEqual({ id: 'assignment-1', status: 'active' });
      expect(assetItemService.setStatus).toHaveBeenCalledWith('t1', 'item-1', 'assigned');
    });
  });

  describe('initiateRecovery()', () => {
    it('flags every active assignment for the employee and marks the asset items in_recovery', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          { id: 'a1', asset_item_id: 'item-1' },
          { id: 'a2', asset_item_id: 'item-2' },
        ],
      });
      const result = await service.initiateRecovery('t1', 'exit-1', 'emp-1');
      expect(result).toHaveLength(2);
      expect(assetItemService.setStatus).toHaveBeenCalledWith('t1', 'item-1', 'in_recovery');
      expect(assetItemService.setStatus).toHaveBeenCalledWith('t1', 'item-2', 'in_recovery');
    });

    it('is a no-op when the employee has no active assignments', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.initiateRecovery('t1', 'exit-1', 'emp-1');
      expect(result).toEqual([]);
      expect(assetItemService.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('recordReturn()', () => {
    it('throws if the assignment does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.recordReturn('t1', 'missing', { return_condition: 'good' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('zeroes the recovery amount and frees the asset when returned in good condition', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'a1', asset_item_id: 'item-1' }] }); // existence check
      db.query.mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'returned', recovery_amount: '0' }] }); // UPDATE

      const result = await service.recordReturn('t1', 'a1', { return_condition: 'good', recovery_amount: 500 });

      expect(result.status).toBe('returned');
      expect(assetItemService.setStatus).toHaveBeenCalledWith('t1', 'item-1', 'available');
      // recovery_amount param passed to the UPDATE must be forced to 0 for 'good' returns regardless of the input
      expect(db.query.mock.calls[1][1]).toEqual(expect.arrayContaining([0]));
    });

    it('charges the recovery amount and marks the item damaged when returned damaged', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'a1', asset_item_id: 'item-1' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'a1', status: 'written_off' }] });

      await service.recordReturn('t1', 'a1', { return_condition: 'damaged', recovery_amount: 2500 });

      expect(assetItemService.setStatus).toHaveBeenCalledWith('t1', 'item-1', 'damaged');
      expect(db.query.mock.calls[1][1]).toEqual(expect.arrayContaining([2500]));
    });
  });

  describe('getRecoveryTotal()', () => {
    it('sums recovery_amount across all assignments tied to the exit request', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total: '2500.50' }] });
      const total = await service.getRecoveryTotal('t1', 'exit-1');
      expect(total).toBe(2500.5);
    });
  });

  describe('allRecovered()', () => {
    it('returns false while any assignment is still recovery_pending', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ outstanding: '2' }] });
      expect(await service.allRecovered('t1', 'exit-1')).toBe(false);
    });

    it('returns true once nothing is outstanding', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ outstanding: '0' }] });
      expect(await service.allRecovered('t1', 'exit-1')).toBe(true);
    });
  });
});
