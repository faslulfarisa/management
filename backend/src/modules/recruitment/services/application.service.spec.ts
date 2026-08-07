import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicationService } from './application.service';

describe('ApplicationService — status/stage transition validation', () => {
  let db: { query: jest.Mock };
  let notifications: { emit: jest.Mock };
  let auditLog: { log: jest.Mock };
  let service: ApplicationService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifications = { emit: jest.fn().mockResolvedValue(undefined) };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ApplicationService(db as any, notifications as any, auditLog as any);
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

  it('creates an application for an open vacancy using an existing open job posting', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', title: 'Chef', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'jp-1', vacancy_id: 'vac-1', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'app-1', candidate_id: 'cand-1', vacancy_id: 'vac-1', job_posting_id: 'jp-1' }] });

    const application = await service.createForVacancy('t1', {
      candidateId: 'cand-1',
      vacancyId: 'vac-1',
      source: 'walk_in',
      actorId: 'user-1',
    });

    expect(application).toEqual(expect.objectContaining({ vacancy_id: 'vac-1', job_posting_id: 'jp-1' }));
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO applications'),
      expect.arrayContaining(['t1', 'cand-1', 'jp-1', 'vac-1', 'walk_in']),
    );
  });

  it('rejects direct application to a vacancy that is not open', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'vac-1', tenant_id: 't1', title: 'Chef', status: 'draft' }] });

    await expect(service.createForVacancy('t1', { candidateId: 'cand-1', vacancyId: 'vac-1' })).rejects.toThrow(BadRequestException);
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
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      userId: 'user-1',
      entityType: 'application',
      entityId: 'app-1',
      action: 'pipeline_stage_changed',
      newValues: expect.objectContaining({ stage_id: 'stage-new', stage_name: 'Interview Round 1', status: 'shortlisted' }),
    }));
  });
});
