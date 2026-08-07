import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplianceDocumentRequestService } from './compliance-document-request.service';

describe('ComplianceDocumentRequestService', () => {
  let db: { query: jest.Mock };
  let notifier: { emit: jest.Mock };
  let service: ComplianceDocumentRequestService;

  beforeEach(() => {
    db = { query: jest.fn() };
    notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new ComplianceDocumentRequestService(db as any, notifier as any);
  });

  it('create() notifies the target employee', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', title: 'Upload PAN', employee_id: 'emp-1' }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

    await service.create('t1', 'hr-1', { employee_id: 'emp-1', title: 'Upload PAN' } as any);

    expect(notifier.emit).toHaveBeenCalledWith('t1', expect.objectContaining({ userIds: ['user-1'], title: 'Document requested' }));
  });

  describe('fulfil()', () => {
    it('rejects when the request was not addressed to the calling employee', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', employee_id: 'emp-OTHER', requested_by: 'hr-1' }] });
      await expect(service.fulfil('req-1', 't1', 'emp-1', 'doc-1')).rejects.toThrow(BadRequestException);
    });

    it('marks the request uploaded and notifies the requester', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', employee_id: 'emp-1', requested_by: 'hr-1', title: 'Upload PAN' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'uploaded' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'hr-1' }] });

      const result = await service.fulfil('req-1', 't1', 'emp-1', 'doc-1');

      expect(result.status).toBe('uploaded');
      expect(notifier.emit).toHaveBeenCalledWith('t1', expect.objectContaining({ userIds: ['hr-1'] }));
    });

    it('throws when the request does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.fulfil('missing', 't1', 'emp-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('decide()', () => {
    it('rejects deciding on a request that has not been uploaded yet', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending' }] });
      await expect(service.decide('req-1', 't1', 'hr-1', true)).rejects.toThrow(BadRequestException);
    });

    it('approving sets status=approved and notifies the employee', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'uploaded', employee_id: 'emp-1', title: 'Upload PAN', resulting_document_id: 'doc-1' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'approved' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

      const result = await service.decide('req-1', 't1', 'hr-1', true, 'looks good');

      expect(result.status).toBe('approved');
      expect(notifier.emit).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'Document request approved' }));
    });

    it('requesting resubmission sets status back to pending and clears the resulting document', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'uploaded', employee_id: 'emp-1', title: 'Upload PAN', resulting_document_id: 'doc-1' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'req-1', status: 'pending' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

      await service.decide('req-1', 't1', 'hr-1', false, 'wrong file');

      const updateCall = db.query.mock.calls[1];
      expect(updateCall[1]).toEqual(['req-1', 't1', 'pending', 'wrong file', null]);
      expect(notifier.emit).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'Resubmission requested' }));
    });
  });
});
