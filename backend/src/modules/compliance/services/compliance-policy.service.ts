import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';

/** Policy publish -> acknowledgement requirement -> tracking who has/hasn't acknowledged. */
@Injectable()
export class CompliancePolicyService {
  constructor(
    private db: DatabaseService,
    private notifier: NotificationEmitterService,
  ) {}

  /** Called after a policy-category document is approved — creates one pending row per active employee in scope and notifies them. */
  async publish(tenantId: string, documentId: string, publishedById: string): Promise<{ created: number }> {
    const { rows: docRows } = await this.db.query(`SELECT * FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [documentId, tenantId]);
    if (!docRows.length) throw new NotFoundException('Document not found');
    const doc = docRows[0];

    let employeeQuery = `SELECT id FROM employees WHERE tenant_id = $1 AND status = 'active' AND deleted_at IS NULL`;
    const params: any[] = [tenantId];
    if (doc.branch_id) { employeeQuery += ` AND branch_id = $2`; params.push(doc.branch_id); }
    const { rows: employees } = await this.db.query(employeeQuery, params);

    for (const emp of employees) {
      await this.db.query(
        `INSERT INTO compliance_policy_acknowledgements (tenant_id, document_id, employee_id, version_acknowledged, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (document_id, employee_id, version_acknowledged) DO NOTHING`,
        [tenantId, documentId, emp.id, doc.current_version],
      );
    }

    const { rows: users } = await this.db.query(`SELECT id FROM users WHERE tenant_id = $1 AND employee_id = ANY($2::uuid[])`, [tenantId, employees.map((e: any) => e.id)]);
    await this.notifier.emit(tenantId, {
      userIds: users.map((u: any) => u.id),
      title: 'New policy requires acknowledgement',
      message: `"${doc.title}" has been published and requires your acknowledgement.`,
      type: 'info',
      priority: 'medium',
      sourceModule: 'compliance',
      entityType: 'compliance_document',
      entityId: documentId,
      actionUrl: '/dashboard/compliance/policies',
    });

    return { created: employees.length };
  }

  async acknowledge(tenantId: string, documentId: string, employeeId: string, ipAddress?: string) {
    const { rows: docRows } = await this.db.query(`SELECT current_version FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [documentId, tenantId]);
    if (!docRows.length) throw new NotFoundException('Document not found');
    const version = docRows[0].current_version;

    const { rows } = await this.db.query(
      `INSERT INTO compliance_policy_acknowledgements (tenant_id, document_id, employee_id, version_acknowledged, status, acknowledged_at, ip_address)
       VALUES ($1, $2, $3, $4, 'acknowledged', now(), $5)
       ON CONFLICT (document_id, employee_id, version_acknowledged)
       DO UPDATE SET status = 'acknowledged', acknowledged_at = now(), ip_address = $5
       RETURNING *`,
      [tenantId, documentId, employeeId, version, ipAddress ?? null],
    );
    return rows[0];
  }

  async getAcknowledgementStatus(tenantId: string, documentId: string) {
    const { rows: docRows } = await this.db.query(`SELECT current_version FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [documentId, tenantId]);
    if (!docRows.length) throw new NotFoundException('Document not found');

    const { rows } = await this.db.query(
      `SELECT a.*, e.first_name, e.last_name, e.employee_code
       FROM compliance_policy_acknowledgements a
       JOIN employees e ON e.id = a.employee_id
       WHERE a.tenant_id = $1 AND a.document_id = $2 AND a.version_acknowledged = $3
       ORDER BY a.status ASC, e.first_name`,
      [tenantId, documentId, docRows[0].current_version],
    );
    return rows;
  }

  /** Policies still pending acknowledgement for the calling employee (self-service widget). */
  async listPendingForEmployee(tenantId: string, employeeId: string) {
    if (!employeeId) throw new BadRequestException('No employee profile linked to this account');
    const { rows } = await this.db.query(
      `SELECT a.*, d.title, d.description FROM compliance_policy_acknowledgements a
       JOIN compliance_documents d ON d.id = a.document_id
       WHERE a.tenant_id = $1 AND a.employee_id = $2 AND a.status = 'pending'
       ORDER BY a.created_at DESC`,
      [tenantId, employeeId],
    );
    return rows;
  }
}
