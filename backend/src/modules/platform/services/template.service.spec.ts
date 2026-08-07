import { ConflictException } from '@nestjs/common';
import { TemplateService } from './template.service';

describe('TemplateService assignment rules', () => {
  let db: { query: jest.Mock };
  let service: TemplateService;

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new TemplateService(db as any);
  });

  it('blocks a second direct leave policy assignment for the same employee', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ template_type: 'leave_policy' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'assignment-1' }] });

    await expect(
      service.assign('tenant-1', {
        template_id: 'template-2',
        scope_type: 'employee',
        scope_id: 'employee-1',
      }),
    ).rejects.toThrow(ConflictException);

    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('uses the persisted template type when creating an assignment', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ template_type: 'leave_policy' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'assignment-2', template_type: 'leave_policy' }] });

    const result = await service.assign('tenant-1', {
      template_id: 'template-1',
      template_type: 'leave_policy',
      scope_type: 'employee',
      scope_id: 'employee-1',
      priority: 100,
    });

    expect(result.id).toBe('assignment-2');
    expect(db.query).toHaveBeenLastCalledWith(expect.any(String), [
      'tenant-1',
      'template-1',
      'leave_policy',
      'employee',
      'employee-1',
      100,
      undefined,
      undefined,
    ]);
  });
});
