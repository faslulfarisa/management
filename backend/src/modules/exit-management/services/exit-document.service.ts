import { Injectable } from '@nestjs/common';
import { DocumentService } from '../../platform/services/document.service';
import { DatabaseService } from '../../../shared/database.service';

const DOCUMENT_TYPES = ['acceptance_letter', 'relieving_letter', 'experience_certificate', 'service_certificate', 'fnf_statement', 'settlement_receipt', 'exit_summary'] as const;

/** Thin wrapper registering client-generated exit letter/statement PDFs into the existing generic documents table. */
@Injectable()
export class ExitDocumentService {
  constructor(
    private readonly documentService: DocumentService,
    private readonly db: DatabaseService,
  ) {}

  async register(tenantId: string, createdById: string, data: {
    exit_request_id: string;
    document_type: typeof DOCUMENT_TYPES[number];
    name: string;
    file_url: string;
    file_size_bytes?: number;
    mime_type?: string;
  }) {
    const document = await this.documentService.create(tenantId, createdById, {
      entity_type: 'exit_request',
      entity_id: data.exit_request_id,
      document_type: data.document_type,
      name: data.name,
      file_url: data.file_url,
      file_size_bytes: data.file_size_bytes,
      mime_type: data.mime_type ?? 'application/pdf',
    });

    if (data.document_type === 'fnf_statement' || data.document_type === 'settlement_receipt') {
      await this.db.query(
        `UPDATE final_settlements SET pdf_document_id = $1 WHERE tenant_id = $2 AND exit_request_id = $3`,
        [document.id, tenantId, data.exit_request_id],
      );
    }
    return document;
  }

  async list(tenantId: string, exitRequestId: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM documents WHERE tenant_id = $1 AND entity_type = 'exit_request' AND entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [tenantId, exitRequestId],
    );
    return rows;
  }
}
