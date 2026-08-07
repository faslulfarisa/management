import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { CreateDocumentRequestDto } from '../dto/compliance-document-request.dto';

/** HR/Admin asks an employee to upload a specific document (PAN, passport, degree certificate, etc.). */
@Injectable()
export class ComplianceDocumentRequestService {
  constructor(
    private db: DatabaseService,
    private notifier: NotificationEmitterService,
  ) {}

  async list(tenantId: string, filters: { employeeId?: string; status?: string } = {}) {
    let where = 'r.tenant_id = $1';
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters.employeeId) { where += ` AND r.employee_id = $${idx++}`; params.push(filters.employeeId); }
    if (filters.status) { where += ` AND r.status = $${idx++}`; params.push(filters.status); }

    const { rows } = await this.db.query(
      `SELECT r.*, e.first_name, e.last_name, e.employee_code, c.name AS category_name
       FROM compliance_document_requests r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN compliance_categories c ON c.id = r.category_id
       WHERE ${where} ORDER BY r.created_at DESC`,
      params,
    );
    return rows;
  }

  async create(tenantId: string, requestedById: string, dto: CreateDocumentRequestDto) {
    const { rows } = await this.db.query(
      `INSERT INTO compliance_document_requests (tenant_id, employee_id, category_id, title, instructions, requested_by, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId, dto.employee_id, dto.category_id ?? null, dto.title, dto.instructions ?? null, requestedById, dto.due_date ?? null],
    );
    const request = rows[0];

    const { rows: users } = await this.db.query(`SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2`, [tenantId, dto.employee_id]);
    await this.notifier.emit(tenantId, {
      userIds: users.map((u: any) => u.id),
      title: 'Document requested',
      message: `Please upload: ${dto.title}`,
      type: 'info',
      priority: 'medium',
      sourceModule: 'compliance',
      entityType: 'compliance_document_request',
      entityId: request.id,
      actionUrl: '/dashboard/compliance/employee-documents',
    });
    return request;
  }

  async fulfil(id: string, tenantId: string, employeeId: string, documentId: string) {
    const { rows: existing } = await this.db.query(`SELECT * FROM compliance_document_requests WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Request not found');
    if (existing[0].employee_id !== employeeId) throw new BadRequestException('This request was not addressed to you');

    const { rows } = await this.db.query(
      `UPDATE compliance_document_requests SET status = 'uploaded', resulting_document_id = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, documentId],
    );

    const { rows: requesterUsers } = await this.db.query(`SELECT id FROM users WHERE id = $1`, [existing[0].requested_by]);
    if (requesterUsers.length) {
      await this.notifier.emit(tenantId, {
        userIds: [requesterUsers[0].id],
        title: 'Requested document uploaded',
        message: `"${existing[0].title}" has been uploaded and is awaiting your review.`,
        type: 'info',
        priority: 'medium',
        sourceModule: 'compliance',
        entityType: 'compliance_document_request',
        entityId: id,
        actionUrl: '/dashboard/compliance/employee-documents',
      });
    }
    return rows[0];
  }

  async decide(id: string, tenantId: string, decidedById: string, approve: boolean, remarks?: string) {
    const { rows: existing } = await this.db.query(`SELECT * FROM compliance_document_requests WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!existing.length) throw new NotFoundException('Request not found');
    if (existing[0].status !== 'uploaded') throw new BadRequestException('Only an uploaded request can be approved or sent back for resubmission');

    const newStatus = approve ? 'approved' : 'pending';
    const { rows } = await this.db.query(
      `UPDATE compliance_document_requests SET status = $3, remarks = $4, resulting_document_id = $5, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, newStatus, remarks ?? null, approve ? existing[0].resulting_document_id : null],
    );

    const { rows: users } = await this.db.query(`SELECT id FROM users WHERE tenant_id = $1 AND employee_id = $2`, [tenantId, existing[0].employee_id]);
    await this.notifier.emit(tenantId, {
      userIds: users.map((u: any) => u.id),
      title: approve ? 'Document request approved' : 'Resubmission requested',
      message: approve
        ? `"${existing[0].title}" has been approved.`
        : `"${existing[0].title}" needs to be resubmitted${remarks ? `: ${remarks}` : ''}.`,
      type: approve ? 'success' : 'warning',
      priority: 'medium',
      sourceModule: 'compliance',
      entityType: 'compliance_document_request',
      entityId: id,
      actionUrl: '/dashboard/compliance/employee-documents',
    });
    return rows[0];
  }
}
