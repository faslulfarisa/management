import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplianceApprovalService } from './compliance-approval.service';

describe('ComplianceApprovalService', () => {
  let db: { query: jest.Mock };
  let approvalEngine: { submit: jest.Mock; approveByEntity: jest.Mock; rejectByEntity: jest.Mock };
  let auditLog: { log: jest.Mock };
  let documents: { uploadVersion: jest.Mock };
  let service: ComplianceApprovalService;

  beforeEach(() => {
    db = { query: jest.fn() };
    approvalEngine = {
      submit: jest.fn().mockResolvedValue({ id: 'req-1', status: 'pending' }),
      approveByEntity: jest.fn().mockResolvedValue({ fullyApproved: true }),
      rejectByEntity: jest.fn().mockResolvedValue({ status: 'rejected' }),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    documents = { uploadVersion: jest.fn().mockResolvedValue({ id: 'doc-1', current_version: 2 }) };
    service = new ComplianceApprovalService(db as any, approvalEngine as any, auditLog as any, documents as any);
  });

  describe('submit()', () => {
    it('flips the document to pending_approval and submits through the shared approval engine', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', status: 'draft', title: 'GST Cert', branch_id: 'b1', department_id: null, category_id: 'cat-1', scope: 'company', employee_id: null }] });
      db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE status

      await service.submit('t1', 'doc-1', 'user-1');

      expect(db.query.mock.calls[1][0]).toContain("status = 'pending_approval'");
      expect(approvalEngine.submit).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 't1', workflowType: 'compliance_document', entityId: 'doc-1', entityTable: 'compliance_documents', submittedBy: 'user-1',
      }));
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'submit_for_approval' }));
    });

    it('rejects re-submission of a document already mid-approval', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', status: 'pending_approval' }] });
      await expect(service.submit('t1', 'doc-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(approvalEngine.submit).not.toHaveBeenCalled();
    });

    it('throws when the document does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.submit('t1', 'missing', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve()/reject()', () => {
    it('approve() delegates to the approval engine then mirrors approval_status onto the lifecycle status column', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // syncLifecycleStatus UPDATE

      await service.approve('t1', 'doc-1', 'approver-1', 'looks good');

      expect(approvalEngine.approveByEntity).toHaveBeenCalledWith('doc-1', 'compliance_documents', 't1', 'approver-1', 'looks good', undefined, undefined);
      expect(db.query.mock.calls[0][0]).toContain("WHEN approval_status = 'approved' THEN 'approved'");
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve' }));
    });

    it('reject() delegates to the approval engine then syncs the lifecycle status', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await service.reject('t1', 'doc-1', 'approver-1', 'missing pages');
      expect(approvalEngine.rejectByEntity).toHaveBeenCalledWith('doc-1', 'compliance_documents', 't1', 'approver-1', 'missing pages', undefined);
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject' }));
    });
  });

  describe('requestRenewal()', () => {
    it('uploads a new version then re-submits the document through the approval workflow', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', status: 'renewal_pending', title: 'GST Cert', branch_id: null, department_id: null, category_id: 'cat-1', scope: 'company', employee_id: null }] });
      db.query.mockResolvedValueOnce({ rows: [] });

      await service.requestRenewal('t1', 'doc-1', 'user-1', { file_url: 'https://files/renewed.pdf' });

      expect(documents.uploadVersion).toHaveBeenCalledWith('doc-1', 't1', 'user-1', { file_url: 'https://files/renewed.pdf' });
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'renewal_requested' }));
      expect(approvalEngine.submit).toHaveBeenCalled();
    });
  });
});
