import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplianceDocumentService } from './compliance-document.service';

describe('ComplianceDocumentService', () => {
  let db: { query: jest.Mock };
  let fileUpload: { getSignedDownloadUrl: jest.Mock };
  let auditLog: { log: jest.Mock };
  let authz: { can: jest.Mock };
  let service: ComplianceDocumentService;

  const globalScope = { isGlobalAccess: true, branchIds: [] };
  const authUser = { sub: 'user-1', tenantId: 't1', isSuperAdmin: false, userType: 'employee', employeeId: 'emp-1' };

  beforeEach(() => {
    db = { query: jest.fn() };
    fileUpload = { getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/file') };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    authz = { can: jest.fn().mockResolvedValue(false) };
    service = new ComplianceDocumentService(db as any, fileUpload as any, auditLog as any, authz as any);
  });

  describe('create()', () => {
    it('inserts the document and, when a file is supplied, creates version 1 and audit-logs the upload', async () => {
      const docRow = { id: 'doc-1', title: 'GST Certificate', scope: 'company', category_id: 'cat-1' };
      db.query.mockResolvedValueOnce({ rows: [docRow] }); // INSERT compliance_documents
      db.query.mockResolvedValueOnce({ rows: [] }); // INSERT compliance_document_versions

      const result = await service.create('t1', 'user-1', {
        scope: 'company', category_id: 'cat-1', document_type: 'gst', title: 'GST Certificate',
        file_url: 'https://files/gst.pdf', file_name: 'gst.pdf',
      } as any);

      expect(result).toEqual(docRow);
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(String(db.query.mock.calls[1][0])).toContain('INSERT INTO compliance_document_versions');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'upload', entityId: 'doc-1' }));
    });

    it('requires employee_id for employee-scope documents', async () => {
      await expect(service.create('t1', 'user-1', { scope: 'employee', category_id: 'cat-1', document_type: 'passport', title: 'Passport' } as any))
        .rejects.toThrow(BadRequestException);
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('uploadVersion()', () => {
    it('appends a new version and bumps current_version on the parent document without touching version 1', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', current_version: 1 }] }); // fetch doc
      db.query.mockResolvedValueOnce({ rows: [] }); // INSERT version 2
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', current_version: 2 }] }); // UPDATE parent

      const result = await service.uploadVersion('doc-1', 't1', 'user-1', { file_url: 'https://files/v2.pdf' });

      expect(result.current_version).toBe(2);
      const versionInsertCall = db.query.mock.calls[1];
      expect(String(versionInsertCall[0])).toContain('INSERT INTO compliance_document_versions');
      expect(versionInsertCall[1]).toEqual(expect.arrayContaining(['doc-1', 't1', 2, 'https://files/v2.pdf']));
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'version_change' }));
    });

    it('throws when the document does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.uploadVersion('missing', 't1', 'user-1', { file_url: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('restoreVersion()', () => {
    it('creates a new version copying the old file pointer instead of mutating history', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ file_url: 'https://files/v1.pdf', file_name: 'v1.pdf', file_size_bytes: 100, mime_type: 'application/pdf' }] }); // fetch old version
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', current_version: 3 }] }); // fetch doc (inside uploadVersion)
      db.query.mockResolvedValueOnce({ rows: [] }); // INSERT version
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc-1', current_version: 4 }] }); // UPDATE parent

      const result = await service.restoreVersion('doc-1', 't1', 'user-1', 1);

      expect(result.current_version).toBe(4);
      const versionInsertCall = db.query.mock.calls[2];
      expect(versionInsertCall[1]).toEqual(expect.arrayContaining(['https://files/v1.pdf', 'v1.pdf']));
      expect(String(versionInsertCall[1].find((p: any) => typeof p === 'string' && p.includes('Restored')))).toContain('Restored from version 1');
    });

    it('throws when the requested version does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.restoreVersion('doc-1', 't1', 'user-1', 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list() — confidentiality & employee self-scoping', () => {
    it('restricts a plain employee to their own + direct reports + non-confidential rows (no privileged bypass)', async () => {
      authz.can.mockResolvedValue(false); // no manage/admin/approve permission
      db.query.mockResolvedValueOnce({ rows: [] }); // getDirectReportIds
      db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // count
      db.query.mockResolvedValueOnce({ rows: [] }); // data

      await service.list('t1', authUser as any, globalScope as any, {});

      const countCall = db.query.mock.calls[1];
      expect(countCall[0]).toContain("d.scope != 'employee' OR");
      expect(countCall[0]).toContain('confidentiality_level');
      expect(countCall[1]).toEqual(expect.arrayContaining(['emp-1']));
    });

    it('bypasses confidentiality/self-scoping entirely for a privileged (compliance admin) caller', async () => {
      authz.can.mockResolvedValueOnce(true); // COMPLIANCE_EMPLOYEE_DOCS_MANAGE
      authz.can.mockResolvedValueOnce(true); // COMPLIANCE_ADMIN
      authz.can.mockResolvedValueOnce(false); // COMPLIANCE_APPROVE
      db.query.mockResolvedValueOnce({ rows: [] }); // getDirectReportIds
      db.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      db.query.mockResolvedValueOnce({ rows: [] });

      await service.list('t1', authUser as any, globalScope as any, {});

      const countCall = db.query.mock.calls[1];
      expect(countCall[0]).toContain('AND TRUE AND TRUE');
    });
  });

  describe('getDownloadUrl()', () => {
    it('resolves a signed URL and audit-logs the download', async () => {
      const doc = { id: 'doc-1', file_url: 'https://files/x.pdf', file_name: 'x.pdf', branch_id: null };
      db.query.mockResolvedValueOnce({ rows: [doc] }); // findOne base query
      db.query.mockResolvedValueOnce({ rows: [] }); // getDirectReportIds (inside buildVisibilityClause)
      db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // visibility check

      const result = await service.getDownloadUrl('doc-1', 't1', authUser as any, globalScope as any);

      expect(fileUpload.getSignedDownloadUrl).toHaveBeenCalledWith('https://files/x.pdf', 300);
      expect(result.url).toBe('https://signed.example/file');
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'download', entityId: 'doc-1' }));
    });

    it('rejects when the document has no file attached', async () => {
      const doc = { id: 'doc-1', file_url: null, branch_id: null };
      db.query.mockResolvedValueOnce({ rows: [doc] });
      db.query.mockResolvedValueOnce({ rows: [] }); // getDirectReportIds
      db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
      await expect(service.getDownloadUrl('doc-1', 't1', authUser as any, globalScope as any)).rejects.toThrow(BadRequestException);
    });
  });
});
