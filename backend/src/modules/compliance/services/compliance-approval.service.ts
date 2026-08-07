import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { ComplianceDocumentService } from './compliance-document.service';
import { UploadVersionDto } from '../dto/compliance-document.dto';

const WORKFLOW_TYPE = 'compliance_document';

/**
 * Thin wrapper around the existing ApprovalEngineService — gives compliance
 * documents the same multi-step/SLA/escalation approval machinery already
 * used by leave_requests, expenses, exit_requests, etc. Branch admins
 * configure the actual chain via the existing Approval Chains UI; with none
 * configured, ApprovalEngineService falls back to "org admins only".
 */
@Injectable()
export class ComplianceApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private documents: ComplianceDocumentService,
  ) {}

  async submit(tenantId: string, documentId: string, submittedById: string) {
    const { rows } = await this.db.query(`SELECT * FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [documentId, tenantId]);
    if (!rows.length) throw new NotFoundException('Document not found');
    const doc = rows[0];
    if (!['draft', 'rejected', 'renewal_pending'].includes(doc.status)) {
      throw new BadRequestException(`Cannot submit a document with status '${doc.status}' for approval`);
    }

    await this.db.query(
      `UPDATE compliance_documents SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [documentId, tenantId],
    );

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: documentId,
      entityTable: 'compliance_documents',
      submittedBy: submittedById,
      branchId: doc.branch_id,
      departmentId: doc.department_id,
      title: `Compliance document approval: ${doc.title}`,
      description: doc.description ?? undefined,
      metadata: { category_id: doc.category_id, scope: doc.scope, employee_id: doc.employee_id },
    });

    await this.auditLog.log({
      tenantId, userId: submittedById, entityType: 'compliance_document', entityId: documentId, action: 'submit_for_approval',
    });
    return request;
  }

  async approve(tenantId: string, documentId: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(documentId, 'compliance_documents', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(documentId, tenantId);
    await this.auditLog.log({
      tenantId, userId: approverId, entityType: 'compliance_document', entityId: documentId, action: 'approve', newValues: { reason },
    });
    return result;
  }

  async reject(tenantId: string, documentId: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(documentId, 'compliance_documents', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(documentId, tenantId);
    await this.auditLog.log({
      tenantId, userId: rejecterId, entityType: 'compliance_document', entityId: documentId, action: 'reject', newValues: { reason },
    });
    return result;
  }

  /** Expiring/expired document -> new version uploaded -> re-submitted through the same approval workflow. */
  async requestRenewal(tenantId: string, documentId: string, requestedById: string, dto: UploadVersionDto) {
    await this.documents.uploadVersion(documentId, tenantId, requestedById, dto);
    await this.auditLog.log({
      tenantId, userId: requestedById, entityType: 'compliance_document', entityId: documentId, action: 'renewal_requested',
    });
    return this.submit(tenantId, documentId, requestedById);
  }

  /** `approval_status` is what ApprovalEngineService writes; mirror it onto the broader lifecycle `status` column. */
  private async syncLifecycleStatus(documentId: string, tenantId: string) {
    await this.db.query(
      `UPDATE compliance_documents SET status = CASE
          WHEN approval_status = 'approved' THEN 'approved'
          WHEN approval_status = 'rejected' THEN 'rejected'
          ELSE status
        END,
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [documentId, tenantId],
    );
  }
}
