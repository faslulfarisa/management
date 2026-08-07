import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';

const AUDIT_TYPES = ['internal_audit', 'external_audit', 'govt_inspection'];

@Injectable()
export class ComplianceDashboardService {
  constructor(private db: DatabaseService) {}

  async getCards(tenantId: string, accessScope: AccessScope) {
    const branchScope = branchScopeClause(accessScope, 'branch_id', 2);

    const [docs, requests, tracker, certsExpiring] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE scope = 'company')::int AS company_docs,
           COUNT(*) FILTER (WHERE scope = 'employee')::int AS employee_docs,
           COUNT(*) FILTER (WHERE approval_status = 'pending')::int AS pending_approvals,
           COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
           COUNT(*) FILTER (WHERE status = 'renewal_pending')::int AS renewals,
           COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date BETWEEN now() AND now() + INTERVAL '90 days' AND status NOT IN ('renewal_pending', 'expired'))::int AS expiring
         FROM compliance_documents
         WHERE tenant_id = $1 AND status != 'deleted' AND (branch_id IS NULL OR ${branchScope.clause})`,
        [tenantId, ...branchScope.params],
      ),
      this.db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_employee_uploads
         FROM compliance_document_requests WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COALESCE(ROUND(AVG(completion_percent)), 0)::int AS compliance_percent,
           COUNT(*) FILTER (WHERE compliance_type = ANY($2::text[]) AND status != 'completed')::int AS open_audits
         FROM compliance_tracker_items WHERE tenant_id = $1`,
        [tenantId, AUDIT_TYPES],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS certs_expiring FROM compliance_documents d
         JOIN compliance_categories c ON c.id = d.category_id
         WHERE d.tenant_id = $1 AND d.status != 'deleted' AND c.group_label = 'Certification'
           AND d.expiry_date IS NOT NULL AND d.expiry_date BETWEEN now() AND now() + INTERVAL '90 days'`,
        [tenantId],
      ),
    ]);

    return {
      ...docs.rows[0],
      ...requests.rows[0],
      ...tracker.rows[0],
      ...certsExpiring.rows[0],
    };
  }

  async getExpiryTimeline(tenantId: string, accessScope: AccessScope) {
    const branchScope = branchScopeClause(accessScope, 'd.branch_id', 2);

    const { rows } = await this.db.query(
      `SELECT d.id, d.title, d.scope, d.expiry_date, d.status, c.group_label AS category_group_label
       FROM compliance_documents d LEFT JOIN compliance_categories c ON c.id = d.category_id
       WHERE d.tenant_id = $1 AND d.status NOT IN ('deleted','archived','renewal_pending','expired') AND d.expiry_date IS NOT NULL
         AND (d.branch_id IS NULL OR ${branchScope.clause})
       ORDER BY d.expiry_date ASC LIMIT 50`,
      [tenantId, ...branchScope.params],
    );
    return rows;
  }

  async getRecentAuditActivity(tenantId: string, limit = 20) {
    const { rows } = await this.db.query(
      `SELECT al.*, u.email AS actor_email FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.tenant_id = $1 AND al.entity_type LIKE 'compliance%'
       ORDER BY al.created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return rows;
  }
}
