import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { FileUploadService } from '../../../shared/file-upload.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { AuthorizationService, AuthUser } from '../../platform/services/authorization.service';
import { AccessScope, branchScopeClause } from '../../../shared/scope.util';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import {
  CreateComplianceDocumentDto, UpdateComplianceDocumentDto, UploadVersionDto,
} from '../dto/compliance-document.dto';

export interface DocumentFilters {
  scope?: string;
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  categoryId?: string;
  groupLabel?: string;
  status?: string;
  confidentialityLevel?: string;
  q?: string;
  tag?: string;
  documentNumber?: string;
  uploadedBy?: string;
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

/** Central CRUD + versioning + search for company and employee compliance documents. */
@Injectable()
export class ComplianceDocumentService {
  constructor(
    private db: DatabaseService,
    private fileUpload: FileUploadService,
    private auditLog: AuditLogService,
    private authz: AuthorizationService,
  ) {}

  // ── Visibility helpers ──────────────────────────────────────────────────

  private async getDirectReportIds(tenantId: string, employeeId: string | null): Promise<string[]> {
    if (!employeeId) return [];
    const { rows } = await this.db.query(
      `SELECT id FROM employees WHERE tenant_id = $1 AND reporting_manager_id = $2`,
      [tenantId, employeeId],
    );
    return rows.map((r: any) => r.id);
  }

  /** Resolves the SQL fragment enforcing confidentiality + employee self/manager scoping for `d`. */
  private async buildVisibilityClause(
    tenantId: string, authUser: AuthUser & { sub: string; employeeId?: string | null }, paramIndex: number,
  ): Promise<{ clause: string; params: any[]; nextIndex: number }> {
    const [canManageEmployeeDocs, canAdmin, canApprove] = await Promise.all([
      this.authz.can(authUser, PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_MANAGE),
      this.authz.can(authUser, PERMISSIONS.COMPLIANCE_ADMIN),
      this.authz.can(authUser, PERMISSIONS.COMPLIANCE_APPROVE),
    ]);
    const isPrivileged = canAdmin || canApprove;
    const directReportIds = await this.getDirectReportIds(tenantId, authUser.employeeId ?? null);

    let idx = paramIndex;
    const params: any[] = [];

    // Employee-scope row visibility: self, direct manager, or someone with broad employee-doc access.
    let employeeScopeClause = 'TRUE';
    if (!canManageEmployeeDocs && !isPrivileged) {
      const conditions: string[] = [];
      if (authUser.employeeId) { conditions.push(`d.employee_id = $${idx++}`); params.push(authUser.employeeId); }
      if (directReportIds.length) { conditions.push(`d.employee_id = ANY($${idx++}::uuid[])`); params.push(directReportIds); }
      employeeScopeClause = `(d.scope != 'employee' OR ${conditions.length ? conditions.join(' OR ') : 'FALSE'})`;
    }

    // Confidentiality gating: confidential/restricted rows are hidden unless privileged, owner, uploader, or in employee-scope above.
    let confidentialityClause = 'TRUE';
    if (!isPrivileged) {
      const conditions: string[] = [`d.confidentiality_level NOT IN ('confidential','restricted')`];
      conditions.push(`d.owner_id = $${idx++}`); params.push(authUser.sub);
      conditions.push(`d.created_by = $${idx++}`); params.push(authUser.sub);
      if (authUser.employeeId) { conditions.push(`d.employee_id = $${idx++}`); params.push(authUser.employeeId); }
      if (directReportIds.length) { conditions.push(`d.employee_id = ANY($${idx++}::uuid[])`); params.push(directReportIds); }
      confidentialityClause = `(${conditions.join(' OR ')})`;
    }

    return { clause: `${employeeScopeClause} AND ${confidentialityClause}`, params, nextIndex: idx };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async list(
    tenantId: string, authUser: AuthUser & { sub: string; employeeId?: string | null },
    accessScope: AccessScope, filters: DocumentFilters,
  ): Promise<{ data: any[]; total: number }> {
    const { page = 1, limit = 50 } = filters;
    const offset = (Number(page) - 1) * Number(limit);

    let where = `d.tenant_id = $1 AND d.status != 'deleted'`;
    const params: any[] = [tenantId];
    let idx = 2;

    if (filters.scope) { where += ` AND d.scope = $${idx++}`; params.push(filters.scope); }
    if (filters.employeeId) { where += ` AND d.employee_id = $${idx++}`; params.push(filters.employeeId); }
    if (filters.branchId) { where += ` AND d.branch_id = $${idx++}`; params.push(filters.branchId); }
    if (filters.departmentId) { where += ` AND d.department_id = $${idx++}`; params.push(filters.departmentId); }
    if (filters.categoryId) { where += ` AND d.category_id = $${idx++}`; params.push(filters.categoryId); }
    if (filters.status) {
      if (filters.status === 'renewal_pending') {
        where += ` AND (
          d.status = 'renewal_pending'
          OR (d.status = 'pending_approval' AND d.current_version > 1)
          OR (d.status IN ('approved', 'draft', 'pending_approval') AND d.expiry_date IS NOT NULL AND d.expiry_date <= now() + INTERVAL '90 days')
        )`;
      } else {
        where += ` AND d.status = $${idx++}`;
        params.push(filters.status);
      }
    }
    if (filters.confidentialityLevel) { where += ` AND d.confidentiality_level = $${idx++}`; params.push(filters.confidentialityLevel); }
    if (filters.documentNumber) { where += ` AND d.document_number ILIKE $${idx++}`; params.push(`%${filters.documentNumber}%`); }
    if (filters.uploadedBy) { where += ` AND d.created_by = $${idx++}`; params.push(filters.uploadedBy); }
    if (filters.tag) { where += ` AND $${idx++} = ANY(d.tags)`; params.push(filters.tag); }
    if (filters.groupLabel) { where += ` AND c.group_label = $${idx++}`; params.push(filters.groupLabel); }
    if (filters.expiringWithinDays !== undefined) {
      where += ` AND d.expiry_date IS NOT NULL AND d.expiry_date <= now() + ($${idx++} || ' days')::interval`;
      params.push(filters.expiringWithinDays);
    }
    if (filters.q) {
      where += ` AND (d.title ILIKE $${idx} OR d.description ILIKE $${idx} OR d.document_number ILIKE $${idx})`;
      params.push(`%${filters.q}%`); idx++;
    }

    if (!accessScope.isGlobalAccess) {
      const scope = branchScopeClause(accessScope, 'd.branch_id', idx);
      where += ` AND (d.branch_id IS NULL OR ${scope.clause})`;
      params.push(...scope.params);
      idx += scope.params.length;
    }

    const visibility = await this.buildVisibilityClause(tenantId, authUser, idx);
    where += ` AND ${visibility.clause}`;
    params.push(...visibility.params);
    idx = visibility.nextIndex;

    const fromClause = `FROM compliance_documents d LEFT JOIN compliance_categories c ON c.id = d.category_id WHERE ${where}`;

    const [countResult, dataResult] = await Promise.all([
      this.db.query(`SELECT COUNT(*) ${fromClause}`, params),
      this.db.query(
        `SELECT d.*, c.name AS category_name, c.group_label AS category_group_label ${fromClause}
         ORDER BY d.expiry_date ASC NULLS LAST, d.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset],
      ),
    ]);

    return { data: dataResult.rows, total: parseInt(countResult.rows[0].count, 10) };
  }

  async findOne(
    id: string, tenantId: string, authUser: AuthUser & { sub: string; employeeId?: string | null }, accessScope: AccessScope,
  ): Promise<any> {
    const { rows } = await this.db.query(
      `SELECT d.*, c.name AS category_name, c.group_label AS category_group_label
       FROM compliance_documents d LEFT JOIN compliance_categories c ON c.id = d.category_id
       WHERE d.id = $1 AND d.tenant_id = $2 AND d.status != 'deleted'`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Document not found');
    const doc = rows[0];

    if (!accessScope.isGlobalAccess && doc.branch_id) {
      const inScope = accessScope.branchIds.includes(doc.branch_id);
      if (!inScope) throw new NotFoundException('Document not found');
    }

    const visibility = await this.buildVisibilityClause(tenantId, authUser, 2);
    const { rows: visRows } = await this.db.query(
      `SELECT 1 FROM compliance_documents d WHERE d.id = $1 AND ${visibility.clause}`,
      [id, ...visibility.params],
    );
    if (!visRows.length) throw new NotFoundException('Document not found');

    return doc;
  }

  async create(tenantId: string, createdById: string, dto: CreateComplianceDocumentDto): Promise<any> {
    if (dto.scope === 'employee' && !dto.employee_id) {
      throw new BadRequestException('employee_id is required for employee-scope documents');
    }

    let branchId = dto.branch_id ?? null;
    if (dto.scope === 'employee' && dto.employee_id && !branchId) {
      const { rows } = await this.db.query(`SELECT branch_id FROM employees WHERE id = $1 AND tenant_id = $2`, [dto.employee_id, tenantId]);
      branchId = rows[0]?.branch_id ?? null;
    }

    const { rows } = await this.db.query(
      `INSERT INTO compliance_documents
        (tenant_id, scope, employee_id, category_id, document_type, name, title, description, owner_id,
         department_id, branch_id, tags, issue_date, expiry_date, renewal_date, grace_period_days,
         confidentiality_level, document_number, issuing_authority, extra_fields, remarks,
         file_url, file_name, file_size_bytes, mime_type, current_version, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,$25,$26,$27)
       RETURNING *`,
      [
        tenantId, dto.scope, dto.employee_id ?? null, dto.category_id, dto.document_type, dto.title, dto.title,
        dto.description ?? null, dto.owner_id ?? createdById, dto.department_id ?? null, branchId,
        dto.tags ?? [], dto.issue_date ?? null, dto.expiry_date ?? null, dto.renewal_date ?? null,
        dto.grace_period_days ?? 0, dto.confidentiality_level ?? 'internal', dto.document_number ?? null,
        dto.issuing_authority ?? null, JSON.stringify(dto.extra_fields ?? {}), dto.remarks ?? null,
        dto.file_url ?? null, dto.file_name ?? null, dto.file_size_bytes ?? null, dto.mime_type ?? null,
        dto.file_url ? 1 : 0, createdById,
      ],
    );
    const doc = rows[0];

    if (dto.file_url) {
      await this.db.query(
        `INSERT INTO compliance_document_versions (document_id, tenant_id, version_number, file_url, file_name, file_size_bytes, mime_type, change_note, uploaded_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,'Initial upload',$7)`,
        [doc.id, tenantId, dto.file_url, dto.file_name ?? null, dto.file_size_bytes ?? null, dto.mime_type ?? null, createdById],
      );
    }

    await this.auditLog.log({
      tenantId, userId: createdById, entityType: 'compliance_document', entityId: doc.id,
      action: 'upload', newValues: { title: doc.title, scope: doc.scope, category_id: doc.category_id },
    });

    return doc;
  }

  async update(id: string, tenantId: string, updatedById: string, dto: UpdateComplianceDocumentDto): Promise<any> {
    const { rows: existingRows } = await this.db.query(`SELECT * FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!existingRows.length) throw new NotFoundException('Document not found');
    const before = existingRows[0];

    const { rows } = await this.db.query(
      `UPDATE compliance_documents SET
        category_id = COALESCE($3, category_id),
        document_type = COALESCE($4, document_type),
        title = COALESCE($5, title),
        description = COALESCE($6, description),
        owner_id = COALESCE($7, owner_id),
        department_id = COALESCE($8, department_id),
        branch_id = COALESCE($9, branch_id),
        tags = COALESCE($10::text[], tags),
        issue_date = COALESCE($11, issue_date),
        expiry_date = COALESCE($12, expiry_date),
        renewal_date = COALESCE($13, renewal_date),
        grace_period_days = COALESCE($14, grace_period_days),
        confidentiality_level = COALESCE($15, confidentiality_level),
        document_number = COALESCE($16, document_number),
        issuing_authority = COALESCE($17, issuing_authority),
        extra_fields = COALESCE($18::jsonb, extra_fields),
        remarks = COALESCE($19, remarks),
        last_updated_by = $20,
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        id, tenantId, dto.category_id ?? null, dto.document_type ?? null, dto.title ?? null, dto.description ?? null,
        dto.owner_id ?? null, dto.department_id ?? null, dto.branch_id ?? null, dto.tags ?? null,
        dto.issue_date ?? null, dto.expiry_date ?? null, dto.renewal_date ?? null, dto.grace_period_days ?? null,
        dto.confidentiality_level ?? null, dto.document_number ?? null, dto.issuing_authority ?? null,
        dto.extra_fields ? JSON.stringify(dto.extra_fields) : null, dto.remarks ?? null, updatedById,
      ],
    );

    await this.auditLog.log({
      tenantId, userId: updatedById, entityType: 'compliance_document', entityId: id,
      action: 'update', oldValues: before, newValues: rows[0],
    });
    return rows[0];
  }

  // ── Versioning ───────────────────────────────────────────────────────────

  async uploadVersion(id: string, tenantId: string, uploadedById: string, dto: UploadVersionDto): Promise<any> {
    const { rows: docRows } = await this.db.query(`SELECT * FROM compliance_documents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!docRows.length) throw new NotFoundException('Document not found');
    const doc = docRows[0];
    const nextVersion = doc.current_version + 1;

    await this.db.query(
      `INSERT INTO compliance_document_versions (document_id, tenant_id, version_number, file_url, file_name, file_size_bytes, mime_type, change_note, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, tenantId, nextVersion, dto.file_url, dto.file_name ?? null, dto.file_size_bytes ?? null, dto.mime_type ?? null,
        dto.change_note ?? `Version ${nextVersion}`, uploadedById],
    );

    const { rows } = await this.db.query(
      `UPDATE compliance_documents SET
        file_url = $3, file_name = $4, file_size_bytes = $5, mime_type = $6,
        current_version = $7, last_updated_by = $8, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.file_url, dto.file_name ?? null, dto.file_size_bytes ?? null, dto.mime_type ?? null, nextVersion, uploadedById],
    );

    await this.auditLog.log({
      tenantId, userId: uploadedById, entityType: 'compliance_document', entityId: id,
      action: 'version_change', newValues: { version: nextVersion, change_note: dto.change_note },
    });
    return rows[0];
  }

  async listVersions(id: string, tenantId: string): Promise<any[]> {
    const { rows } = await this.db.query(
      `SELECT v.*, u.email AS uploaded_by_email FROM compliance_document_versions v
       LEFT JOIN users u ON u.id = v.uploaded_by
       WHERE v.document_id = $1 AND v.tenant_id = $2 ORDER BY v.version_number DESC`,
      [id, tenantId],
    );
    return rows;
  }

  /** "Restore previous version" — never mutates history, just appends a new version copying the old file pointer. */
  async restoreVersion(id: string, tenantId: string, restoredById: string, versionNumber: number): Promise<any> {
    const { rows: versionRows } = await this.db.query(
      `SELECT * FROM compliance_document_versions WHERE document_id = $1 AND tenant_id = $2 AND version_number = $3`,
      [id, tenantId, versionNumber],
    );
    if (!versionRows.length) throw new NotFoundException('Version not found');
    const old = versionRows[0];

    return this.uploadVersion(id, tenantId, restoredById, {
      file_url: old.file_url,
      file_name: old.file_name,
      file_size_bytes: old.file_size_bytes,
      mime_type: old.mime_type,
      change_note: `Restored from version ${versionNumber}`,
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async archive(id: string, tenantId: string, actorId: string): Promise<any> {
    const { rows } = await this.db.query(
      `UPDATE compliance_documents SET status = 'archived', last_updated_by = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, actorId],
    );
    if (!rows.length) throw new NotFoundException('Document not found');
    await this.auditLog.log({ tenantId, userId: actorId, entityType: 'compliance_document', entityId: id, action: 'archive' });
    return rows[0];
  }

  async softDelete(id: string, tenantId: string, actorId: string): Promise<{ success: true }> {
    const { rows } = await this.db.query(
      `UPDATE compliance_documents SET status = 'deleted', deleted_at = now(), last_updated_by = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId, actorId],
    );
    if (!rows.length) throw new NotFoundException('Document not found');
    await this.auditLog.log({ tenantId, userId: actorId, entityType: 'compliance_document', entityId: id, action: 'delete' });
    return { success: true };
  }

  // ── Secure download ──────────────────────────────────────────────────────

  async getDownloadUrl(
    id: string, tenantId: string, authUser: AuthUser & { sub: string; employeeId?: string | null }, accessScope: AccessScope,
  ): Promise<{ url: string; fileName: string | null }> {
    const doc = await this.findOne(id, tenantId, authUser, accessScope);
    if (!doc.file_url) throw new BadRequestException('No file attached to this document');

    const url = await this.fileUpload.getSignedDownloadUrl(doc.file_url, 300);

    await this.auditLog.log({
      tenantId, userId: authUser.sub, entityType: 'compliance_document', entityId: id, action: 'download',
    });

    return { url, fileName: doc.file_name };
  }
}
