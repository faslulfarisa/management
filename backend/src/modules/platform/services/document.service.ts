import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { AccessScope, branchScopeClause, isBranchInScope } from '../../../shared/scope.util';

@Injectable()
export class DocumentService {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, entityType?: string, entityId?: string, accessScope?: AccessScope) {
    let query = `SELECT d.* FROM documents d
      LEFT JOIN employees e ON d.entity_type = 'employee' AND d.entity_id = e.id
      WHERE d.tenant_id = $1 AND d.deleted_at IS NULL`;
    const params: any[] = [tenantId];
    let idx = 2;
    if (entityType) { query += ` AND d.entity_type = $${idx++}`; params.push(entityType); }
    if (entityId) { query += ` AND d.entity_id = $${idx++}`; params.push(entityId); }
    if (accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'e.branch_id', idx);
      query += ` AND (d.entity_type != 'employee' OR ${scope.clause})`;
      params.push(...scope.params);
      idx += scope.params.length;
    }
    query += ' ORDER BY d.created_at DESC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }

  async findOne(id: string, tenantId: string, accessScope?: AccessScope) {
    const { rows } = await this.db.query(
      `SELECT d.*, e.branch_id AS employee_branch_id FROM documents d
       LEFT JOIN employees e ON d.entity_type = 'employee' AND d.entity_id = e.id
       WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Document not found');
    const doc = rows[0];
    if (accessScope && !accessScope.isGlobalAccess && doc.entity_type === 'employee' && !isBranchInScope(accessScope, doc.employee_branch_id)) {
      throw new NotFoundException('Document not found');
    }
    delete doc.employee_branch_id;
    return doc;
  }

  async create(tenantId: string, createdById: string, data: any) {
    const { rows } = await this.db.query(
      'INSERT INTO documents (tenant_id, entity_type, entity_id, document_type, name, file_url, file_size_bytes, mime_type, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [tenantId, data.entity_type, data.entity_id, data.document_type, data.name, data.file_url, data.file_size_bytes, data.mime_type, data.expires_at, createdById],
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: any, accessScope?: AccessScope) {
    await this.findOne(id, tenantId, accessScope);
    const { rows } = await this.db.query(
      'UPDATE documents SET name = COALESCE($3, name), file_url = COALESCE($4, file_url), mime_type = COALESCE($5, mime_type), expires_at = COALESCE($6, expires_at), updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, data.name, data.file_url, data.mime_type, data.expires_at],
    );
    return rows[0];
  }

  async remove(id: string, tenantId: string, accessScope?: AccessScope) {
    await this.findOne(id, tenantId, accessScope);
    await this.db.query('UPDATE documents SET deleted_at = now() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return { success: true };
  }

  async verify(id: string, tenantId: string, verifiedById: string, accessScope?: AccessScope) {
    await this.findOne(id, tenantId, accessScope);
    const { rows } = await this.db.query(
      'UPDATE documents SET verified_by = $3, verified_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, verifiedById],
    );
    return rows[0];
  }

  async getExpiring(tenantId: string, days: number, accessScope?: AccessScope) {
    let query = `SELECT d.* FROM documents d
      LEFT JOIN employees e ON d.entity_type = 'employee' AND d.entity_id = e.id
      WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
      AND d.expires_at IS NOT NULL AND d.expires_at <= now() + ($2 || ' days')::interval AND d.expires_at >= now()`;
    const params: any[] = [tenantId, days];
    if (accessScope && !accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'e.branch_id', 3);
      query += ` AND (d.entity_type != 'employee' OR ${scope.clause})`;
      params.push(...scope.params);
    }
    query += ' ORDER BY d.expires_at ASC';
    const { rows } = await this.db.query(query, params);
    return rows;
  }
}
