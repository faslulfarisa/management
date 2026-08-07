import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicationService } from './application.service';

describe('ApplicationService — status/stage transition validation', () => {
  let db: { query: jest.Mock };
  let notifications: { emit: jest.Mock };
  let service: ApplicationService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifications = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new ApplicationService(db as any, notifications as any);
  });

  it('rejects updateStatus with a status outside the coarse application lifecycle', async () => {
    await expect(service.updateStatus('app-1', 't1', 'user-1', 'not_a_real_status')).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects moveStage when the target pipeline stage does not exist or is inactive', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'app-1', tenant_id: 't1', candidate_id: 'cand-1', job_posting_id: 'jp-1', current_stage_id: null, vacancy_id: null }] }) // findOne (application)
      .mockResolvedValueOnce({ rows: [] }); // pipeline_stages lookup -> not found/inactive

    await expect(service.moveStage('app-1', 't1', 'user-1', 'stage-missing')).rejects.toThrow(NotFoundException);
  });

  it('records candidate_pipeline_history and skips notification when the application has no linked vacancy', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'app-1', tenant_id: 't1', candidate_id: 'cand-1', job_posting_id: 'jp-1', current_stage_id: 'stage-old', vacancy_id: null, first_name: 'Jane', last_name: 'Doe' }] }) // findOne
      .mockResolvedValueOnce({ rows: [{ id: 'stage-new', name: 'Interview Round 1' }] }) // pipeline_stages lookup
      .mockResolvedValueOnce({ rows: [{ id: 'app-1', current_stage_id: 'stage-new' }] }) // UPDATE applications
      .mockResolvedValueOnce({ rows: [{ id: 'hist-1', from_stage_id: 'stage-old', to_stage_id: 'stage-new' }] }); // INSERT candidate_pipeline_history

    const result = await service.moveStage('app-1', 't1', 'user-1', 'stage-new', 'Moved after screening call');

    expect(result.application.current_stage_id).toBe('stage-new');
    expect(result.history.to_stage_id).toBe('stage-new');
    expect(notifications.emit).not.toHaveBeenCalled();
  });
});
