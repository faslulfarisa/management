import { ExitChecklistService } from './exit-checklist.service';

describe('ExitChecklistService', () => {
  let db: { query: jest.Mock };
  let templateService: { getResolved: jest.Mock };
  let notificationEmitter: { emit: jest.Mock };
  let timeline: { record: jest.Mock };
  let service: ExitChecklistService;

  beforeEach(() => {
    db = { query: jest.fn() };
    templateService = { getResolved: jest.fn() };
    notificationEmitter = { emit: jest.fn().mockResolvedValue(undefined) };
    timeline = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ExitChecklistService(db as any, templateService as any, notificationEmitter as any, timeline as any);
  });

  describe('applyTemplate()', () => {
    it('does nothing if checklist items already exist for the exit request (idempotent on re-approval)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ exists: 1 }] }); // existing check
      db.query.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] }); // list()

      await service.applyTemplate('t1', 'exit-1', 'emp-1');

      expect(templateService.getResolved).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('falls back to the built-in default item set when no exit_checklist template is configured', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // existing check -> none
      templateService.getResolved.mockResolvedValueOnce(null);
      // one INSERT per default item, then list() at the end
      db.query.mockResolvedValue({ rows: [] });

      await service.applyTemplate('t1', 'exit-1', 'emp-1');

      expect(templateService.getResolved).toHaveBeenCalledWith('t1', 'exit_checklist', 'employee', 'emp-1');
      // 13 default items + 1 existence check + 1 final list() = 15 calls (no template.id update since template is null)
      expect(db.query.mock.calls.length).toBeGreaterThanOrEqual(13);
    });

    it('uses the resolved template config items instead of the built-in defaults when one is configured', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // existing check -> none
      templateService.getResolved.mockResolvedValueOnce({
        id: 'tpl-1',
        config: { items: [{ item: 'Return Badge', department: 'Admin', is_mandatory: true }] },
      });
      db.query.mockResolvedValue({ rows: [] });

      await service.applyTemplate('t1', 'exit-1', 'emp-1');

      const insertCalls = db.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO exit_checklist'));
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1]).toEqual(
        expect.arrayContaining(['t1', 'exit-1', 'Return Badge', 'Admin']),
      );

      const templateLinkCall = db.query.mock.calls.find((c) => String(c[0]).includes('UPDATE exit_requests SET template_id'));
      expect(templateLinkCall).toBeTruthy();
    });
  });

  describe('progress()', () => {
    it('reports completion percentage and mandatory outstanding count', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total: '4', completed: '2', mandatory_outstanding: '1' }] });
      const result = await service.progress('t1', 'exit-1');
      expect(result).toEqual({ total: 4, completed: 2, percent: 50, mandatoryOutstanding: 1 });
    });

    it('returns zero percent when there are no checklist items', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total: '0', completed: '0', mandatory_outstanding: '0' }] });
      const result = await service.progress('t1', 'exit-1');
      expect(result.percent).toBe(0);
    });
  });
});
