import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';

const LICENSE_GROUP_LABELS = ['License', 'Government Registration', 'Certification'];

/** Feeds the reports/compliance frontend page — admin/export-gated, so no per-row confidentiality filtering here. */
@Injectable()
export class ComplianceReportService {
  constructor(private db: DatabaseService) {}

  async documentInventory(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.title, d.scope, d.document_type, c.name AS category, c.group_label,
              e.first_name, e.last_name, d.status, d.confidentiality_level,
              d.issue_date, d.expiry_date, d.current_version, d.created_at
       FROM compliance_documents d
       LEFT JOIN compliance_categories c ON c.id = d.category_id
       LEFT JOIN employees e ON e.id = d.employee_id
       WHERE d.tenant_id = $1 AND d.status != 'deleted'
       ORDER BY d.created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async expiredDocuments(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.title, d.scope, d.document_type, e.first_name, e.last_name, d.expiry_date, d.owner_id, u.email AS owner_email
       FROM compliance_documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       LEFT JOIN users u ON u.id = d.owner_id
       WHERE d.tenant_id = $1 AND d.status = 'expired'
       ORDER BY d.expiry_date ASC`,
      [tenantId],
    );
    return rows;
  }

  async upcomingRenewals(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.title, d.scope, d.document_type, d.status, d.expiry_date, d.renewal_date,
              (d.expiry_date - CURRENT_DATE) AS days_remaining
       FROM compliance_documents d
       WHERE d.tenant_id = $1 AND d.status IN ('renewal_pending', 'expired')
       ORDER BY d.expiry_date ASC`,
      [tenantId],
    );
    return rows;
  }

  /** Active employees missing a document in a mandatory (system) employee-document category. */
  async employeeMissingDocuments(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT e.employee_code, e.first_name, e.last_name, c.name AS missing_category
       FROM employees e
       CROSS JOIN compliance_categories c
       WHERE e.tenant_id = $1 AND e.status = 'active' AND e.deleted_at IS NULL
         AND c.scope = 'employee' AND c.is_system = true AND c.tenant_id IS NULL AND c.code != 'custom'
         AND NOT EXISTS (
           SELECT 1 FROM compliance_documents d
           WHERE d.employee_id = e.id AND d.category_id = c.id AND d.status NOT IN ('deleted','rejected')
         )
       ORDER BY e.first_name, c.sort_order`,
      [tenantId],
    );
    return rows;
  }

  async companyLicenseReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.title, c.name AS category, d.document_number, d.issuing_authority, d.status,
              d.issue_date, d.expiry_date, d.renewal_date
       FROM compliance_documents d
       JOIN compliance_categories c ON c.id = d.category_id
       WHERE d.tenant_id = $1 AND d.scope = 'company' AND d.status != 'deleted'
         AND c.group_label = ANY($2::text[])
       ORDER BY d.expiry_date ASC NULLS LAST`,
      [tenantId, LICENSE_GROUP_LABELS],
    );
    return rows;
  }

  async policyAcknowledgementReport(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT d.title AS policy, d.current_version,
              COUNT(*)::int AS total_employees,
              COUNT(*) FILTER (WHERE a.status = 'acknowledged')::int AS acknowledged,
              COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending
       FROM compliance_policy_acknowledgements a
       JOIN compliance_documents d ON d.id = a.document_id
       WHERE a.tenant_id = $1
       GROUP BY d.id, d.title, d.current_version
       ORDER BY d.title`,
      [tenantId],
    );
    return rows;
  }

  async auditReport(tenantId: string, filters: { from?: string; to?: string } = {}) {
    let where = `tenant_id = $1 AND entity_type LIKE 'compliance%'`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters.from) { where += ` AND created_at >= $${idx++}`; params.push(filters.from); }
    if (filters.to) { where += ` AND created_at <= $${idx++}`; params.push(filters.to); }

    const { rows } = await this.db.query(
      `SELECT al.action, al.entity_type, al.entity_id, al.created_at, u.email AS actor_email, al.ip_address
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where} ORDER BY al.created_at DESC LIMIT 1000`,
      params,
    );
    return rows;
  }
}
