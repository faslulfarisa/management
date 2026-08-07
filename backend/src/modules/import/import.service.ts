import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../shared/database.service';
import { AccessScope, branchScopeClause } from '../../shared/scope.util';
import {
  DuplicateStrategy,
  ImportFieldDef,
  ImportExistingRecordCheck,
  ImportModuleConfig,
  ImportRegistryService,
  ImportValidationIssue,
} from './import-registry.service';
import { ImportParserService, ParsedImportFile } from './import-parser.service';

export type ImportRowStatus = 'valid' | 'warning' | 'error';
export type ImportSessionStatus = 'preview' | 'ready' | 'processing' | 'completed' | 'failed';

export interface ImportPreviewRow {
  rowNumber: number;
  original: Record<string, unknown>;
  mapped: Record<string, unknown>;
  status: ImportRowStatus;
  issues: ImportValidationIssue[];
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  skippedRows: number;
  duplicateRows: number;
  newRecords: number;
  updatedRecords: number;
  deletedRecords: number;
}

export interface ImportSession {
  id: string;
  module: string;
  title: string;
  tenantId: string;
  userId: string;
  fileName: string;
  format: 'csv' | 'xlsx' | 'pdf';
  sheetName?: string;
  detectedColumns: string[];
  mappings: Record<string, string>;
  rows: ImportPreviewRow[];
  summary: ImportSummary;
  warnings: string[];
  status: ImportSessionStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
  execution?: {
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    warnings: number;
    errors: ImportValidationIssue[];
  };
}

@Injectable()
export class ImportService {
  private readonly sessions = new Map<string, ImportSession>();

  constructor(
    private readonly parser: ImportParserService,
    private readonly registry: ImportRegistryService,
    private readonly db: DatabaseService,
  ) {}

  async createPreview(params: {
    file: Express.Multer.File;
    requestedModule?: string;
    tenantId: string;
    user: any;
    accessScope: AccessScope;
    isSensitiveAllowed: boolean;
  }): Promise<ImportSession> {
    const parsed = await this.parser.parse(params.file);
    const config = this.resolveModule(parsed, params.requestedModule);
    const mappings = this.detectMappings(parsed.headers, config, params.isSensitiveAllowed);
    const rows = await this.validateRows(parsed.rows, config, mappings, params);
    const now = new Date().toISOString();
    const session: ImportSession = {
      id: randomUUID(),
      module: config.module,
      title: config.title,
      tenantId: params.tenantId,
      userId: params.user.sub,
      fileName: parsed.fileName,
      format: parsed.format,
      sheetName: parsed.sheetName,
      detectedColumns: parsed.headers,
      mappings,
      rows,
      summary: this.summarize(rows),
      warnings: parsed.warnings,
      status: rows.some((row) => row.status === 'error') ? 'preview' : 'ready',
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async remapSession(params: {
    sessionId: string;
    tenantId: string;
    user: any;
    accessScope: AccessScope;
    mappings: Record<string, string>;
    editedRows?: Array<Record<string, unknown>>;
    isSensitiveAllowed: boolean;
  }): Promise<ImportSession> {
    const session = this.getOwnedSession(params.sessionId, params.tenantId);
    const config = this.requireConfig(session.module);
    const sourceRows = params.editedRows?.length ? params.editedRows : session.rows.map((row) => row.original);
    const mappings = this.sanitizeMappings(params.mappings, config);
    const rows = await this.validateRows(sourceRows, config, mappings, {
      tenantId: params.tenantId,
      user: params.user,
      accessScope: params.accessScope,
      isSensitiveAllowed: params.isSensitiveAllowed,
      file: undefined as any,
    });

    const updated = {
      ...session,
      mappings,
      rows,
      summary: this.summarize(rows),
      status: rows.some((row) => row.status === 'error') ? 'preview' : 'ready',
      updatedAt: new Date().toISOString(),
    } satisfies ImportSession;
    this.sessions.set(updated.id, updated);
    return updated;
  }

  async confirm(params: {
    sessionId: string;
    tenantId: string;
    user: any;
    accessScope: AccessScope;
    conflictStrategy?: DuplicateStrategy;
    ignoreEmptyValues?: boolean;
    overwriteExisting?: boolean;
  }): Promise<ImportSession> {
    const session = this.getOwnedSession(params.sessionId, params.tenantId);
    const config = this.requireConfig(session.module);
    const errorRows = session.rows.filter((row) => row.status === 'error');
    if (errorRows.length) {
      throw new BadRequestException('Rows with errors must be corrected before import confirmation');
    }
    if (!config.executeRows) {
      throw new BadRequestException(`Import execution is not registered for module: ${session.module}`);
    }

    const startedAt = Date.now();
    const validRows = session.rows
      .filter((row) => row.status === 'valid' || row.status === 'warning')
      .map((row) => row.mapped);

    const processing = { ...session, status: 'processing' as ImportSessionStatus, updatedAt: new Date().toISOString() };
    this.sessions.set(processing.id, processing);

    try {
      const execution = await config.executeRows(validRows, {
        tenantId: params.tenantId,
        user: params.user,
        accessScope: params.accessScope,
        conflictStrategy: params.conflictStrategy ?? config.duplicateStrategy ?? 'skip',
        ignoreEmptyValues: params.ignoreEmptyValues ?? true,
        overwriteExisting: params.overwriteExisting ?? false,
      });

      const completed = {
        ...processing,
        status: 'completed' as ImportSessionStatus,
        execution,
        summary: {
          ...processing.summary,
          skippedRows: execution.skipped,
          newRecords: execution.imported,
          updatedRecords: execution.updated,
        },
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.sessions.set(completed.id, completed);
      return completed;
    } catch (error) {
      const failed = {
        ...processing,
        status: 'failed' as ImportSessionStatus,
        durationMs: Date.now() - startedAt,
        updatedAt: new Date().toISOString(),
      };
      this.sessions.set(failed.id, failed);
      throw error;
    }
  }

  getSession(sessionId: string, tenantId: string): ImportSession {
    return this.getOwnedSession(sessionId, tenantId);
  }

  listHistory(tenantId: string, module?: string): ImportSession[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.tenantId === tenantId && (!module || session.module === module))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  generateCsvReport(sessionId: string, tenantId: string): string {
    const session = this.getOwnedSession(sessionId, tenantId);
    const headers = ['Row Number', 'Status', 'Column', 'Field', 'Value', 'Expected', 'Reason', 'Suggested Fix'];
    const rows = session.rows.flatMap((row) => {
      if (!row.issues.length) {
        return [[row.rowNumber, row.status, '', '', '', '', '', '']];
      }
      return row.issues.map((issue) => [
        row.rowNumber,
        issue.severity,
        issue.column,
        issue.field ?? '',
        issue.value ?? '',
        issue.expected ?? '',
        issue.reason,
        issue.suggestedFix ?? '',
      ]);
    });
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return `\uFEFF${headers.map(escape).join(',')}\n${rows.map((row) => row.map(escape).join(',')).join('\n')}`;
  }

  private resolveModule(parsed: ParsedImportFile, requestedModule?: string): ImportModuleConfig {
    if (requestedModule) {
      return this.requireConfig(requestedModule);
    }

    const normalizedHeaders = new Set(parsed.headers.map((header) => this.normalize(header)));
    const matches = this.registry.listModules()
      .map((module) => this.requireConfig(module))
      .map((config) => ({
        config,
        score: config.fields.reduce((score, field) => {
          const names = [field.header, field.key, ...(field.aliases ?? [])].map((value) => this.normalize(value));
          return score + (names.some((name) => normalizedHeaders.has(name)) ? 1 : 0);
        }, 0),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!matches.length) {
      throw new BadRequestException('Could not detect import module from file headers');
    }
    return matches[0].config;
  }

  private detectMappings(headers: string[], config: ImportModuleConfig, isSensitiveAllowed: boolean): Record<string, string> {
    const mapping: Record<string, string> = {};
    const fields = config.fields.filter((field) => !field.sensitive || isSensitiveAllowed);

    for (const header of headers) {
      const normalizedHeader = this.normalize(header);
      const field = fields.find((candidate) => {
        const aliases = [candidate.key, candidate.header, ...(candidate.aliases ?? [])];
        return aliases.some((alias) => this.normalize(alias) === normalizedHeader);
      });
      if (field) {
        mapping[header] = field.key;
      }
    }

    for (const [header, fieldKey] of Object.entries(config.defaultMappings ?? {})) {
      if (headers.includes(header) && fields.some((field) => field.key === fieldKey)) {
        mapping[header] = fieldKey;
      }
    }

    return mapping;
  }

  private sanitizeMappings(mappings: Record<string, string>, config: ImportModuleConfig): Record<string, string> {
    const allowedFields = new Set(config.fields.map((field) => field.key));
    return Object.fromEntries(Object.entries(mappings).filter(([, field]) => allowedFields.has(field)));
  }

  private async validateRows(
    rows: Array<Record<string, unknown>>,
    config: ImportModuleConfig,
    mappings: Record<string, string>,
    params: {
      tenantId: string;
      user: any;
      accessScope: AccessScope;
      isSensitiveAllowed: boolean;
      file?: Express.Multer.File;
    },
  ): Promise<ImportPreviewRow[]> {
    const duplicateTracker = new Map<string, number>();
    const previewRows: ImportPreviewRow[] = [];

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const mapped = this.mapRow(rawRow, config, mappings, params.isSensitiveAllowed);
      const issues = [
        ...this.validateRequiredFields(mapped, config),
        ...this.validateFieldTypes(mapped, config),
        ...this.validateDuplicateKeys(mapped, config, duplicateTracker, rowNumber),
      ];
      const existingRecordIssue = await this.validateExistingRecord(mapped, config, params.tenantId, params.accessScope);
      if (existingRecordIssue) {
        issues.push(existingRecordIssue);
      }

      if (config.validateRow) {
        issues.push(...await config.validateRow({
          tenantId: params.tenantId,
          user: params.user,
          accessScope: params.accessScope,
          rowNumber,
          rawRow,
          mappedRow: mapped,
        }));
      }

      previewRows.push({
        rowNumber,
        original: rawRow,
        mapped,
        status: issues.some((issue) => issue.severity === 'error') ? 'error' : issues.length ? 'warning' : 'valid',
        issues,
      });
    }

    return previewRows;
  }

  private mapRow(
    row: Record<string, unknown>,
    config: ImportModuleConfig,
    mappings: Record<string, string>,
    isSensitiveAllowed: boolean,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    const fields = new Map(config.fields.map((field) => [field.key, field]));

    for (const [sourceHeader, fieldKey] of Object.entries(mappings)) {
      const field = fields.get(fieldKey);
      if (!field || (field.sensitive && !isSensitiveAllowed)) continue;
      mapped[fieldKey] = this.transformValue(row[sourceHeader], field);
    }

    for (const field of config.fields) {
      if (mapped[field.key] == null || mapped[field.key] === '') {
        mapped[field.key] = field.defaultValue ?? mapped[field.key];
      }
    }

    return mapped;
  }

  private transformValue(value: unknown, field: ImportFieldDef): unknown {
    if (field.transformer) return field.transformer(value);
    if (value == null) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (field.type === 'currency' || field.type === 'number') return trimmed.replace(/,/g, '');
      return trimmed;
    }
    return value;
  }

  private validateRequiredFields(row: Record<string, unknown>, config: ImportModuleConfig): ImportValidationIssue[] {
    return config.requiredFields
      .filter((field) => row[field] == null || row[field] === '')
      .map((field) => ({
        severity: 'error',
        column: field,
        field,
        expected: 'Non-empty value',
        reason: 'Required field is missing',
        suggestedFix: 'Enter a value before confirming the import',
      }));
  }

  private validateFieldTypes(row: Record<string, unknown>, config: ImportModuleConfig): ImportValidationIssue[] {
    const issues: ImportValidationIssue[] = [];
    for (const field of config.fields) {
      const value = row[field.key];
      if (value == null || value === '') continue;

      if ((field.type === 'number' || field.type === 'currency') && Number.isNaN(Number(value))) {
        issues.push(this.issue(field, value, 'A valid number', 'Invalid numeric value'));
      }
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        issues.push(this.issue(field, value, 'A valid email address', 'Invalid email format'));
      }
      if (field.type === 'phone' && !/^\+?[0-9\s-]{7,15}$/.test(String(value))) {
        issues.push(this.issue(field, value, 'A valid phone number', 'Invalid phone number'));
      }
      if (field.type === 'date' && Number.isNaN(Date.parse(String(value)))) {
        issues.push(this.issue(field, value, 'A valid date', 'Invalid date value'));
      }
      if (field.type === 'boolean' && !['true', 'false', 'yes', 'no', '1', '0'].includes(String(value).toLowerCase())) {
        issues.push(this.issue(field, value, 'Yes/No or true/false', 'Invalid boolean value'));
      }
      if (field.type === 'enum' && field.enumValues?.length && !field.enumValues.includes(String(value))) {
        issues.push(this.issue(field, value, field.enumValues.join(', '), 'Unsupported dropdown value'));
      }
      if (field.validate) {
        issues.push(...field.validate(value, row));
      }
    }
    return issues;
  }

  private validateDuplicateKeys(
    row: Record<string, unknown>,
    config: ImportModuleConfig,
    duplicateTracker: Map<string, number>,
    rowNumber: number,
  ): ImportValidationIssue[] {
    if (!config.uniqueKeys.length) return [];
    const key = config.uniqueKeys.map((field) => String(row[field] ?? '').toLowerCase()).join('|');
    if (!key || key.split('|').some((part) => !part)) return [];
    const firstRow = duplicateTracker.get(key);
    if (firstRow) {
      return [{
        severity: 'error',
        column: config.uniqueKeys.join(', '),
        field: config.uniqueKeys.join(', '),
        value: key,
        expected: 'Unique value in the import file',
        reason: `Duplicate row conflicts with row ${firstRow}`,
        suggestedFix: 'Remove the duplicate row or change the unique value',
      }];
    }
    duplicateTracker.set(key, rowNumber);
    return [];
  }

  private async validateExistingRecord(
    row: Record<string, unknown>,
    config: ImportModuleConfig,
    tenantId: string,
    accessScope: AccessScope,
  ): Promise<ImportValidationIssue | null> {
    const check = config.existingRecordCheck;
    if (!check) return null;
    this.assertExistingCheckIsSafe(check);

    const uniqueEntries = Object.entries(check.uniqueFieldColumns)
      .filter(([field]) => row[field] != null && row[field] !== '');

    if (!uniqueEntries.length) return null;

    const params: unknown[] = [tenantId];
    let paramIndex = 2;
    const clauses = [`${check.tenantColumn ?? 'tenant_id'} = $1`];

    for (const [field, column] of uniqueEntries) {
      clauses.push(`LOWER(${column}::text) = LOWER($${paramIndex}::text)`);
      params.push(row[field]);
      paramIndex += 1;
    }

    if (check.branchColumn) {
      const scope = branchScopeClause(accessScope, check.branchColumn, paramIndex);
      if (scope.clause !== 'TRUE') {
        clauses.push(scope.clause);
        params.push(...scope.params);
      }
    }

    const displayColumns = check.displayColumns?.length ? check.displayColumns : ['id'];
    const selectColumns = Array.from(new Set(['id', ...displayColumns])).join(', ');
    const { rows } = await this.db.query(
      `SELECT ${selectColumns} FROM ${check.table} WHERE ${clauses.join(' AND ')} LIMIT 1`,
      params,
    );

    const existing = rows[0];
    if (!existing) return null;

    const matchedFields = uniqueEntries.map(([field]) => field).join(', ');
    const matchedValues = uniqueEntries.map(([field]) => `${field}: ${row[field]}`).join(', ');
    const existingLabel = displayColumns
      .map((column) => existing[column])
      .filter(Boolean)
      .join(' / ');

    return {
      severity: 'warning',
      column: matchedFields,
      field: matchedFields,
      value: matchedValues,
      expected: 'A new unique record',
      reason: `This record already exists${existingLabel ? ` (${existingLabel})` : ''}`,
      suggestedFix: 'Choose Skip duplicates to keep the existing record, or Update/Merge if this import should change it',
    };
  }

  private assertExistingCheckIsSafe(check: ImportExistingRecordCheck): void {
    const identifiers = [
      check.table,
      check.tenantColumn ?? 'tenant_id',
      check.branchColumn,
      ...Object.values(check.uniqueFieldColumns),
      ...(check.displayColumns ?? []),
    ].filter(Boolean) as string[];

    for (const identifier of identifiers) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
        throw new BadRequestException(`Unsafe import registry identifier: ${identifier}`);
      }
    }
  }

  private summarize(rows: ImportPreviewRow[]): ImportSummary {
    const duplicateRows = rows.filter((row) => row.issues.some((issue) => {
      const reason = issue.reason.toLowerCase();
      return reason.includes('duplicate') || reason.includes('already exists');
    })).length;
    return {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === 'valid').length,
      warningRows: rows.filter((row) => row.status === 'warning').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
      skippedRows: 0,
      duplicateRows,
      newRecords: rows.filter((row) => row.status !== 'error').length,
      updatedRecords: 0,
      deletedRecords: 0,
    };
  }

  private issue(field: ImportFieldDef, value: unknown, expected: string, reason: string): ImportValidationIssue {
    return {
      severity: 'error',
      column: field.header,
      field: field.key,
      value,
      expected,
      reason,
      suggestedFix: `Correct ${field.header}`,
    };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  private requireConfig(module: string): ImportModuleConfig {
    const config = this.registry.get(module);
    if (!config) {
      throw new BadRequestException(`Unknown import module: ${module}`);
    }
    return config;
  }

  private getOwnedSession(sessionId: string, tenantId: string): ImportSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException('Import session not found');
    }
    return session;
  }
}
