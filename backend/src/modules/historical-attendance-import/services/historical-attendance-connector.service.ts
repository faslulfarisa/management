import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import * as sql from 'mssql';
import { DatabaseService } from '../../../shared/database.service';
import { ConnectorConfigTestDto, ConnectorReadDto } from '../dto/historical-attendance-import.dto';
import { HistoricalAttendanceImportSourceType } from '../constants/historical-attendance-import.constants';
import { HistoricalAttendanceImportService } from './historical-attendance-import.service';
import { ImportSourceNormalizerService } from './import-source-normalizer.service';

interface Actor {
  sub: string;
}

interface ConnectorSource {
  id: string;
  tenant_id: string;
  source_type: HistoricalAttendanceImportSourceType;
  name: string;
  config: Record<string, any>;
}

export interface ConnectorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ConnectorReadRequest {
  source: ConnectorSource;
  config: Record<string, any>;
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
  cursor: string | null;
  offset: number;
  csvContent?: string;
  records?: Record<string, unknown>[];
}

interface ConnectorReadResult {
  records: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number | null;
  metadata?: Record<string, unknown>;
}

interface HistoricalAttendanceConnector {
  readonly type: HistoricalAttendanceImportSourceType;
  readonly label: string;
  readonly capabilities: {
    dateRange: boolean;
    pagination: boolean;
    chunkedImport: boolean;
    resume: boolean;
    retry: boolean;
    progress: boolean;
    largeDatasets: boolean;
    connectionValidation: boolean;
    credentialTesting: boolean;
    preview: boolean;
  };
  validateConfig(config: Record<string, any>): ConnectorValidationResult;
  testConnection(config: Record<string, any>): Promise<ConnectorValidationResult>;
  read(request: ConnectorReadRequest): Promise<ConnectorReadResult>;
}

const DEFAULT_CHUNK_SIZE = 1000;
const MAX_CHUNK_SIZE = 10000;
const MAX_SYNC_CHUNKS = 100;

function success(warnings: string[] = []): ConnectorValidationResult {
  return { valid: true, errors: [], warnings };
}

function failure(errors: string[], warnings: string[] = []): ConnectorValidationResult {
  return { valid: false, errors, warnings };
}

function mergeConfig(base: Record<string, any>, override?: Record<string, unknown>) {
  return { ...(base ?? {}), ...(override ?? {}) };
}

function getPath(value: any, path?: string): any {
  if (!path) return value;
  return path.split('.').reduce((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) return current[Number(segment)];
    return current[segment];
  }, value);
}

function encodeCursor(cursor: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(cursor?: string | null): Record<string, any> {
  if (!cursor) return {};
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid connector cursor');
  }
}

function validateIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.$]*$/.test(value)) {
    throw new BadRequestException(`${label} contains unsafe characters`);
  }
  return value;
}

function coerceDateRange(request: ConnectorReadRequest) {
  return {
    from: request.dateFrom ? new Date(request.dateFrom) : null,
    to: request.dateTo ? new Date(request.dateTo) : null,
  };
}

function filterRecordsByDate(records: Record<string, unknown>[], request: ConnectorReadRequest) {
  const timestampField = request.config.timestampField ?? request.config.columns?.timestamp ?? 'timestamp';
  const { from, to } = coerceDateRange(request);
  if (!from && !to) return records;

  return records.filter((record) => {
    const value = getPath(record, timestampField);
    if (!value) return false;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

function parseCsv(content: string, delimiter = ',') {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(current);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

abstract class BaseConnector implements HistoricalAttendanceConnector {
  abstract readonly type: HistoricalAttendanceImportSourceType;
  abstract readonly label: string;

  readonly capabilities = {
    dateRange: true,
    pagination: true,
    chunkedImport: true,
    resume: true,
    retry: true,
    progress: true,
    largeDatasets: true,
    connectionValidation: true,
    credentialTesting: true,
    preview: true,
  };

  validateConfig(config: Record<string, any>): ConnectorValidationResult {
    return success(config.timezone ? [] : ['No timezone configured; timestamps with no timezone will be parsed by JavaScript runtime defaults']);
  }

  abstract testConnection(config: Record<string, any>): Promise<ConnectorValidationResult>;
  abstract read(request: ConnectorReadRequest): Promise<ConnectorReadResult>;
}

class RestApiConnector extends BaseConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'rest_api';
  readonly label: string = 'REST API';

  validateConfig(config: Record<string, any>) {
    const errors: string[] = [];
    if (!config.url && !config.baseUrl) errors.push('REST connector requires url or baseUrl');
    return errors.length ? failure(errors) : success();
  }

  async testConnection(config: Record<string, any>) {
    const validation = this.validateConfig(config);
    if (!validation.valid) return validation;
    const url = this.buildUrl(config, { limit: 1, offset: 0, dateFrom: null, dateTo: null, cursor: null } as any);
    const response = await fetch(url, {
      method: config.method ?? 'GET',
      headers: this.buildHeaders(config),
      signal: AbortSignal.timeout(Number(config.timeoutMs ?? 15000)),
    });
    if (!response.ok) return failure([`REST endpoint returned ${response.status}`]);
    return success();
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const url = this.buildUrl(request.config, { ...request, offset });
    const response = await fetch(url, {
      method: request.config.method ?? 'GET',
      headers: this.buildHeaders(request.config),
      body: request.config.method && request.config.method !== 'GET'
        ? JSON.stringify(this.buildBody(request.config, request, offset))
        : undefined,
      signal: AbortSignal.timeout(Number(request.config.timeoutMs ?? 60000)),
    });
    if (!response.ok) throw new BadRequestException(`REST connector returned ${response.status}`);

    const payload = await response.json();
    const dataPath = request.config.dataPath ?? 'data';
    const rows = getPath(payload, dataPath);
    if (!Array.isArray(rows)) throw new BadRequestException(`REST dataPath '${dataPath}' did not resolve to an array`);

    const nextCursorValue = getPath(payload, request.config.nextCursorPath);
    const hasMoreValue = request.config.hasMorePath ? getPath(payload, request.config.hasMorePath) : undefined;
    const hasMore = typeof hasMoreValue === 'boolean' ? hasMoreValue : rows.length >= request.limit;
    const nextCursor = nextCursorValue
      ? String(nextCursorValue)
      : hasMore
        ? encodeCursor({ offset: offset + rows.length })
        : null;

    return {
      records: rows,
      nextCursor,
      hasMore,
      total: request.config.totalPath ? Number(getPath(payload, request.config.totalPath)) : null,
      metadata: { url, offset },
    };
  }

  protected buildUrl(config: Record<string, any>, request: ConnectorReadRequest) {
    const base = config.url ?? `${String(config.baseUrl).replace(/\/$/, '')}/${String(config.path ?? '').replace(/^\//, '')}`;
    const url = new URL(base);
    const pagination = config.pagination ?? {};
    if (request.dateFrom) url.searchParams.set(config.dateFromParam ?? 'from', request.dateFrom);
    if (request.dateTo) url.searchParams.set(config.dateToParam ?? 'to', request.dateTo);
    url.searchParams.set(pagination.limitParam ?? 'limit', String(request.limit));
    if (request.cursor && pagination.type === 'cursor') {
      url.searchParams.set(pagination.cursorParam ?? 'cursor', request.cursor);
    } else {
      url.searchParams.set(pagination.offsetParam ?? 'offset', String(request.offset ?? 0));
    }
    for (const [key, value] of Object.entries(config.params ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  protected buildHeaders(config: Record<string, any>) {
    const headers: Record<string, string> = { Accept: 'application/json', ...(config.headers ?? {}) };
    if (config.method && config.method !== 'GET') headers['Content-Type'] = 'application/json';
    if (config.auth?.type === 'bearer' && config.auth.token) headers.Authorization = `Bearer ${config.auth.token}`;
    if (config.auth?.type === 'api_key' && config.auth.headerName && config.auth.apiKey) headers[config.auth.headerName] = config.auth.apiKey;
    return headers;
  }

  private buildBody(config: Record<string, any>, request: ConnectorReadRequest, offset: number) {
    return {
      ...(config.body ?? {}),
      [config.dateFromParam ?? 'from']: request.dateFrom,
      [config.dateToParam ?? 'to']: request.dateTo,
      [config.pagination?.limitParam ?? 'limit']: request.limit,
      [config.pagination?.offsetParam ?? 'offset']: offset,
    };
  }
}

class EasyTimeProConnector extends RestApiConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'easytime_pro';
  readonly label: string = 'EasyTime Pro';

  validateConfig(config: Record<string, any>) {
    if (config.mode === 'postgresql' || config.mode === 'sql_server' || config.mode === 'mysql') return success();
    return super.validateConfig({
      ...config,
      path: config.path ?? '/iclock/api/transactions/',
      dataPath: config.dataPath ?? 'data',
    });
  }

  async testConnection(config: Record<string, any>) {
    if (config.mode === 'postgresql') return new PostgreSqlConnector().testConnection(config);
    if (config.mode === 'sql_server') return new SqlServerConnector().testConnection(config);
    if (config.mode === 'mysql') return new MySqlConnector().testConnection(config);
    return super.testConnection(config);
  }

  async read(request: ConnectorReadRequest) {
    if (request.config.mode === 'postgresql') return new PostgreSqlConnector().read(request);
    if (request.config.mode === 'sql_server') return new SqlServerConnector().read(request);
    if (request.config.mode === 'mysql') return new MySqlConnector().read(request);
    return super.read({
      ...request,
      config: {
        path: '/iclock/api/transactions/',
        dataPath: 'data',
        timestampField: 'punch_time',
        ...request.config,
      },
    });
  }
}

class ZktecoConnector extends EasyTimeProConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'zkteco';
  readonly label: string = 'ZKTeco';
}

abstract class SqlConnector extends BaseConnector {
  validateConfig(config: Record<string, any>) {
    const errors: string[] = [];
    if (!config.connection) errors.push('SQL connector requires connection settings');
    if (!config.table && !config.query) errors.push('SQL connector requires table or query');
    if (config.table) {
      for (const [key, value] of Object.entries(config.columns ?? {})) {
        if (typeof value === 'string') {
          try {
            validateIdentifier(value, `columns.${key}`);
          } catch (error: any) {
            errors.push(error.message);
          }
        }
      }
      try {
        validateIdentifier(config.table, 'table');
      } catch (error: any) {
        errors.push(error.message);
      }
    }
    return errors.length ? failure(errors) : success();
  }

  protected buildTableQuery(config: Record<string, any>, request: ConnectorReadRequest, placeholder: (index: number) => string) {
    const columns = config.columns ?? {};
    const table = validateIdentifier(config.table, 'table');
    const timestampColumn = validateIdentifier(columns.timestamp ?? config.timestampColumn ?? 'punch_time', 'timestamp column');
    const idColumn = columns.id ? validateIdentifier(columns.id, 'id column') : null;
    const selectedColumns = new Set<string>([
      columns.id ?? 'id',
      columns.employeeIdentifier ?? config.employeeColumn ?? 'employee_code',
      timestampColumn,
      columns.direction ?? config.directionColumn ?? 'punch_direction',
      columns.deviceIdentifier ?? config.deviceColumn ?? 'device_identifier',
      columns.locationIdentifier ?? 'location_identifier',
      columns.verifyMethod ?? 'verify_method',
    ].filter(Boolean));

    let paramIndex = 1;
    const params: any[] = [];
    const where: string[] = [];
    if (request.dateFrom) {
      where.push(`${timestampColumn} >= ${placeholder(paramIndex++)}`);
      params.push(request.dateFrom);
    }
    if (request.dateTo) {
      where.push(`${timestampColumn} <= ${placeholder(paramIndex++)}`);
      params.push(request.dateTo);
    }
    params.push(request.limit);
    const limitPlaceholder = placeholder(paramIndex++);
    params.push(request.offset);
    const offsetPlaceholder = placeholder(paramIndex++);

    const query = `SELECT ${[...selectedColumns].map((column) => validateIdentifier(column, 'selected column')).join(', ')}
      FROM ${table}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${timestampColumn} ASC${idColumn ? `, ${idColumn} ASC` : ''}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;

    return { query, params };
  }

  protected buildCustomQuery(config: Record<string, any>, request: ConnectorReadRequest) {
    const query = String(config.query ?? '').trim();
    if (!/^select\s/i.test(query) || query.includes(';')) {
      throw new BadRequestException('Custom SQL import query must be a single SELECT statement');
    }
    return {
      query,
      params: {
        dateFrom: request.dateFrom,
        dateTo: request.dateTo,
        limit: request.limit,
        offset: request.offset,
      },
    };
  }
}

class PostgreSqlConnector extends SqlConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'postgresql';
  readonly label: string = 'PostgreSQL';

  async testConnection(config: Record<string, any>) {
    const validation = this.validateConfig(config);
    if (!validation.valid) return validation;
    const client = new PgClient(config.connection);
    try {
      await client.connect();
      await client.query('SELECT 1');
      return success();
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const client = new PgClient(request.config.connection);
    try {
      await client.connect();
      const query = request.config.query
        ? this.buildPostgresCustomQuery(request.config, { ...request, offset })
        : this.buildTableQuery(request.config, { ...request, offset }, (index) => `$${index}`);
      const { rows } = await client.query(query.query, query.params);
      return {
        records: rows,
        nextCursor: rows.length >= request.limit ? encodeCursor({ offset: offset + rows.length }) : null,
        hasMore: rows.length >= request.limit,
        metadata: { offset },
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private buildPostgresCustomQuery(config: Record<string, any>, request: ConnectorReadRequest) {
    const base = this.buildCustomQuery(config, request);
    const query = base.query
      .replaceAll(':dateFrom', '$1')
      .replaceAll(':dateTo', '$2')
      .replaceAll(':limit', '$3')
      .replaceAll(':offset', '$4');
    return { query, params: [request.dateFrom, request.dateTo, request.limit, request.offset] };
  }
}

class MySqlConnector extends SqlConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'mysql';
  readonly label: string = 'MySQL';

  async testConnection(config: Record<string, any>) {
    const validation = this.validateConfig(config);
    if (!validation.valid) return validation;
    const connection = await mysql.createConnection(config.connection);
    try {
      await connection.query('SELECT 1');
      return success();
    } finally {
      await connection.end();
    }
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const connection = await mysql.createConnection(request.config.connection);
    try {
      const query = request.config.query
        ? this.buildMySqlCustomQuery(request.config, { ...request, offset })
        : this.buildTableQuery(request.config, { ...request, offset }, () => '?');
      const [rows] = await connection.query(query.query, query.params);
      const records = rows as Record<string, unknown>[];
      return {
        records,
        nextCursor: records.length >= request.limit ? encodeCursor({ offset: offset + records.length }) : null,
        hasMore: records.length >= request.limit,
        metadata: { offset },
      };
    } finally {
      await connection.end();
    }
  }

  private buildMySqlCustomQuery(config: Record<string, any>, request: ConnectorReadRequest) {
    const base = this.buildCustomQuery(config, request);
    return {
      query: base.query.replaceAll(':dateFrom', '?').replaceAll(':dateTo', '?').replaceAll(':limit', '?').replaceAll(':offset', '?'),
      params: [request.dateFrom, request.dateTo, request.limit, request.offset],
    };
  }
}

class SqlServerConnector extends SqlConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'sql_server';
  readonly label: string = 'SQL Server';

  async testConnection(config: Record<string, any>) {
    const validation = this.validateConfig(config);
    if (!validation.valid) return validation;
    const pool = await sql.connect(config.connection);
    try {
      await pool.request().query('SELECT 1 AS ok');
      return success();
    } finally {
      await pool.close();
    }
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const pool = await sql.connect(request.config.connection);
    try {
      const query = request.config.query
        ? this.buildSqlServerCustomQuery(request.config)
        : this.buildSqlServerTableQuery(request.config, { ...request, offset });
      const sqlRequest = pool.request()
        .input('dateFrom', request.dateFrom)
        .input('dateTo', request.dateTo)
        .input('limit', request.limit)
        .input('offset', offset);
      const result = await sqlRequest.query(query);
      const records = result.recordset ?? [];
      return {
        records,
        nextCursor: records.length >= request.limit ? encodeCursor({ offset: offset + records.length }) : null,
        hasMore: records.length >= request.limit,
        metadata: { offset },
      };
    } finally {
      await pool.close();
    }
  }

  private buildSqlServerTableQuery(config: Record<string, any>, request: ConnectorReadRequest) {
    const columns = config.columns ?? {};
    const table = validateIdentifier(config.table, 'table');
    const timestampColumn = validateIdentifier(columns.timestamp ?? config.timestampColumn ?? 'punch_time', 'timestamp column');
    const selectedColumns = new Set<string>([
      columns.id ?? 'id',
      columns.employeeIdentifier ?? config.employeeColumn ?? 'employee_code',
      timestampColumn,
      columns.direction ?? config.directionColumn ?? 'punch_direction',
      columns.deviceIdentifier ?? config.deviceColumn ?? 'device_identifier',
      columns.locationIdentifier ?? 'location_identifier',
      columns.verifyMethod ?? 'verify_method',
    ].filter(Boolean));
    const where: string[] = [];
    if (request.dateFrom) where.push(`${timestampColumn} >= @dateFrom`);
    if (request.dateTo) where.push(`${timestampColumn} <= @dateTo`);
    return `SELECT ${[...selectedColumns].map((column) => validateIdentifier(column, 'selected column')).join(', ')}
      FROM ${table}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${timestampColumn} ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
  }

  private buildSqlServerCustomQuery(config: Record<string, any>) {
    const base = this.buildCustomQuery(config, {} as any);
    return base.query
      .replaceAll(':dateFrom', '@dateFrom')
      .replaceAll(':dateTo', '@dateTo')
      .replaceAll(':limit', '@limit')
      .replaceAll(':offset', '@offset');
  }
}

class SqlDatabaseConnector extends PostgreSqlConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'sql_database';
  readonly label: string = 'SQL Database';
}

class CsvConnector extends BaseConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'csv';
  readonly label: string = 'CSV';

  validateConfig(config: Record<string, any>) {
    return success(config.delimiter ? [] : ['No delimiter configured; comma will be used']);
  }

  async testConnection(config: Record<string, any>) {
    return this.validateConfig(config);
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const content = request.csvContent ?? request.config.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new BadRequestException('CSV connector requires csvContent in the request or source config');
    }
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const records = filterRecordsByDate(parseCsv(content, request.config.delimiter ?? ','), request);
    const chunk = records.slice(offset, offset + request.limit);
    return {
      records: chunk,
      nextCursor: offset + chunk.length < records.length ? encodeCursor({ offset: offset + chunk.length }) : null,
      hasMore: offset + chunk.length < records.length,
      total: records.length,
      metadata: { offset },
    };
  }
}

class SdkConnector extends BaseConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'sdk';
  readonly label: string = 'SDK';

  async testConnection(config: Record<string, any>) {
    return success(config.sdkName ? [] : ['No SDK name configured; treating request records as SDK payload output']);
  }

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const decoded = decodeCursor(request.cursor);
    const offset = Number(decoded.offset ?? request.offset ?? 0);
    const sourceRecords = request.records ?? request.config.records;
    if (!Array.isArray(sourceRecords)) {
      throw new BadRequestException('SDK connector requires records produced by the trusted SDK integration layer');
    }
    const records = filterRecordsByDate(sourceRecords as Record<string, unknown>[], request);
    const chunk = records.slice(offset, offset + request.limit);
    return {
      records: chunk,
      nextCursor: offset + chunk.length < records.length ? encodeCursor({ offset: offset + chunk.length }) : null,
      hasMore: offset + chunk.length < records.length,
      total: records.length,
      metadata: { offset },
    };
  }
}

class DeviceConnector extends RestApiConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'device';
  readonly label: string = 'Device';
}

class VendorSoftwareConnector extends EasyTimeProConnector {
  readonly type: HistoricalAttendanceImportSourceType = 'vendor_software';
  readonly label: string = 'Vendor Software';
}

@Injectable()
export class HistoricalAttendanceConnectorService {
  private readonly connectors: Record<HistoricalAttendanceImportSourceType, HistoricalAttendanceConnector> = {
    device: new DeviceConnector(),
    vendor_software: new VendorSoftwareConnector(),
    easytime_pro: new EasyTimeProConnector(),
    zkteco: new ZktecoConnector(),
    rest_api: new RestApiConnector(),
    sql_database: new SqlDatabaseConnector(),
    sql_server: new SqlServerConnector(),
    postgresql: new PostgreSqlConnector(),
    mysql: new MySqlConnector(),
    csv: new CsvConnector(),
    sdk: new SdkConnector(),
  };

  constructor(
    private readonly db: DatabaseService,
    private readonly importService: HistoricalAttendanceImportService,
    private readonly normalizer: ImportSourceNormalizerService,
  ) {}

  listConnectors() {
    return Object.values(this.connectors).map((connector) => ({
      type: connector.type,
      label: connector.label,
      capabilities: connector.capabilities,
    }));
  }

  async validateSource(tenantId: string, sourceId: string, body: ConnectorConfigTestDto = {}) {
    const source = await this.getSource(tenantId, sourceId);
    const connector = this.getConnector(source.source_type);
    const config = mergeConfig(source.config, body.configOverride);
    return connector.validateConfig(config);
  }

  async testCredentials(tenantId: string, sourceId: string, body: ConnectorConfigTestDto = {}) {
    const source = await this.getSource(tenantId, sourceId);
    const connector = this.getConnector(source.source_type);
    const config = mergeConfig(source.config, body.configOverride);
    return connector.testConnection(config);
  }

  async preview(tenantId: string, sourceId: string, body: ConnectorReadDto = {}) {
    const source = await this.getSource(tenantId, sourceId);
    const connector = this.getConnector(source.source_type);
    const config = mergeConfig(source.config, body.configOverride);
    const result = await connector.read(this.toReadRequest(source, config, body, Math.min(body.limit ?? 50, 100)));
    const normalized = result.records.slice(0, body.limit ?? 50).map((record) => {
      try {
        const normalizedRecord = this.normalizer.normalize(record, { id: source.id, source_type: source.source_type, config });
        return {
          raw: record,
          canonicalPunch: normalizedRecord.canonicalPunch,
          warnings: normalizedRecord.warnings,
          rowHash: normalizedRecord.rowHash,
          errors: [],
        };
      } catch (error: any) {
        return {
          raw: record,
          canonicalPunch: null,
          warnings: [],
          rowHash: null,
          errors: [error?.message ?? 'Normalization failed'],
        };
      }
    });
    return {
      sourceId,
      sourceType: source.source_type,
      records: result.records.slice(0, body.limit ?? 50),
      normalized,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      total: result.total ?? null,
      metadata: result.metadata ?? {},
    };
  }

  async importChunk(tenantId: string, actor: Actor, batchId: string, body: ConnectorReadDto = {}) {
    const batch = await this.getBatch(tenantId, batchId);
    const source = await this.getSource(tenantId, batch.source_id);
    const connector = this.getConnector(source.source_type);
    const config = mergeConfig(source.config, body.configOverride);
    const cursor = body.cursor ?? batch.statistics?.connectorCursor ?? null;
    const result = await connector.read(this.toReadRequest(source, config, { ...body, cursor }, body.limit ?? DEFAULT_CHUNK_SIZE));

    const staged = result.records.length
      ? await this.bulkStageConnectorRecords(tenantId, actor, batchId, source, config, result.records, Number(result.metadata?.offset ?? body.offset ?? 0))
      : { staged: 0, failed: 0, warnings: 0, duplicates: 0 };

    await this.persistConnectorProgress(tenantId, actor.sub, batchId, {
      cursor: result.nextCursor,
      hasMore: result.hasMore,
      sourceType: source.source_type,
      staged: staged.staged,
      failed: staged.failed,
      warnings: staged.warnings,
      duplicates: staged.duplicates,
      total: result.total ?? null,
    });

    return {
      ...staged,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      total: result.total ?? null,
      metadata: result.metadata ?? {},
    };
  }

  async importAll(tenantId: string, actor: Actor, batchId: string, body: ConnectorReadDto = {}) {
    const maxChunks = Math.min(body.maxChunks ?? MAX_SYNC_CHUNKS, MAX_SYNC_CHUNKS);
    let cursor = body.cursor ?? null;
    let chunks = 0;
    const totals = { staged: 0, failed: 0, warnings: 0, duplicates: 0 };
    let lastResult: any = null;

    do {
      lastResult = await this.importChunk(tenantId, actor, batchId, { ...body, cursor: cursor ?? undefined });
      totals.staged += lastResult.staged;
      totals.failed += lastResult.failed;
      totals.warnings += lastResult.warnings;
      totals.duplicates += lastResult.duplicates;
      cursor = lastResult.nextCursor;
      chunks++;
    } while (lastResult.hasMore && cursor && chunks < maxChunks);

    return {
      ...totals,
      chunks,
      hasMore: !!lastResult?.hasMore,
      nextCursor: cursor,
      total: lastResult?.total ?? null,
    };
  }

  private toReadRequest(source: ConnectorSource, config: Record<string, any>, body: ConnectorReadDto, requestedLimit: number): ConnectorReadRequest {
    const limit = Math.max(1, Math.min(requestedLimit || DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE));
    return {
      source,
      config,
      dateFrom: body.dateFrom ?? null,
      dateTo: body.dateTo ?? null,
      limit,
      cursor: body.cursor ?? null,
      offset: body.offset ?? 0,
      csvContent: body.csvContent,
      records: body.records,
    };
  }

  private getConnector(type: HistoricalAttendanceImportSourceType) {
    const connector = this.connectors[type];
    if (!connector) throw new BadRequestException(`Unsupported connector source type: ${type}`);
    return connector;
  }

  private async bulkStageConnectorRecords(
    tenantId: string,
    actor: Actor,
    batchId: string,
    source: ConnectorSource,
    config: Record<string, any>,
    records: Record<string, unknown>[],
    offset: number,
  ) {
    const batch = await this.getBatch(tenantId, batchId);
    if (['paused', 'completed', 'rolling_back', 'rolled_back', 'cancelled'].includes(batch.status)) {
      throw new BadRequestException('Cannot stage connector rows into a paused, completed, rolled back, or cancelled batch');
    }

    const normalizedRows: any[] = [];
    const failedRows: any[] = [];
    let warnings = 0;

    records.forEach((record, index) => {
      try {
        const normalized = this.normalizer.normalize(record, {
          id: source.id,
          source_type: source.source_type,
          config,
        });
        warnings += normalized.warnings.length;
        normalizedRows.push({
          rowNumber: offset + index + 1,
          rawPayload: record,
          canonicalPunch: normalized.canonicalPunch,
          rowHash: normalized.rowHash,
          warnings: normalized.warnings,
        });
      } catch (error: any) {
        failedRows.push({
          rowNumber: offset + index + 1,
          rawPayload: record,
          errors: [error?.message ?? 'Normalization failed'],
        });
      }
    });

    let staged = 0;
    let duplicates = 0;

    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = CASE WHEN status = 'draft' THEN 'uploading' ELSE status END,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenantId],
      );

      for (let index = 0; index < normalizedRows.length; index += 1000) {
        const chunk = normalizedRows.slice(index, index + 1000);
        const params: any[] = [];
        const values: string[] = [];
        chunk.forEach((row) => {
          const base = params.length;
          params.push(
            tenantId,
            batchId,
            source.id,
            row.rowNumber,
            JSON.stringify(row.rawPayload),
            JSON.stringify(row.canonicalPunch),
            row.canonicalPunch.employeeIdentifier,
            row.canonicalPunch.punchTimestamp,
            row.canonicalPunch.punchDirection,
            row.canonicalPunch.deviceIdentifier,
            row.canonicalPunch.locationIdentifier,
            1,
            row.rowHash,
            JSON.stringify(row.warnings),
          );
          values.push(
            `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5}::jsonb,$${base + 6}::jsonb,$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},'staged',$${base + 14}::jsonb,'[]'::jsonb)`,
          );
        });

        const inserted = await client.query(
          `INSERT INTO historical_attendance_import_staging_rows
             (tenant_id, batch_id, source_id, row_number, raw_payload, canonical_punch,
              raw_employee_identifier, punched_at, punch_direction, device_identifier,
              location_identifier, confidence, row_hash, status, warnings, errors)
           VALUES ${values.join(',')}
           ON CONFLICT DO NOTHING
           RETURNING id`,
          params,
        );
        staged += inserted.rows.length;
        duplicates += chunk.length - inserted.rows.length;
      }

      for (let index = 0; index < failedRows.length; index += 1000) {
        const chunk = failedRows.slice(index, index + 1000);
        const params: any[] = [];
        const values: string[] = [];
        chunk.forEach((row) => {
          const base = params.length;
          params.push(tenantId, batchId, source.id, row.rowNumber, JSON.stringify(row.rawPayload), JSON.stringify(row.errors));
          values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5}::jsonb,'{}'::jsonb,'normalization_failed','[]'::jsonb,$${base + 6}::jsonb)`);
        });

        await client.query(
          `INSERT INTO historical_attendance_import_staging_rows
             (tenant_id, batch_id, source_id, row_number, raw_payload, canonical_punch,
              status, warnings, errors)
           VALUES ${values.join(',')}`,
          params,
        );
      }

      await this.refreshBatchStatsWithClient(client, tenantId, batchId, actor.sub);
    });

    return { staged, failed: failedRows.length, warnings, duplicates };
  }

  private async refreshBatchStatsWithClient(client: any, tenantId: string, batchId: string, actorUserId: string) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (WHERE status = 'staged')::int AS staged_rows,
         COUNT(*) FILTER (WHERE status = 'normalization_failed')::int AS failed_rows,
         COALESCE(SUM(jsonb_array_length(warnings)), 0)::int AS warning_count
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId],
    );
    const stats = rows[0];
    const progress = stats.total_rows > 0 ? Math.round((stats.staged_rows / stats.total_rows) * 10000) / 100 : 0;

    await client.query(
      `UPDATE historical_attendance_import_batches
       SET statistics = COALESCE(statistics, '{}'::jsonb) || jsonb_build_object(
             'totalRecords', $3::int,
             'stagedRecords', $4::int,
             'importedRecords', COALESCE((statistics->>'importedRecords')::int, 0),
             'failedRecords', $5::int,
             'warnings', $6::int
           ),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [batchId, tenantId, stats.total_rows, stats.staged_rows, stats.failed_rows, stats.warning_count],
    );

    await client.query(
      `INSERT INTO historical_attendance_import_progress
         (tenant_id, batch_id, phase, total_rows, processed_rows, imported_records,
          failed_records, warning_count, progress_percent, message, updated_by)
       VALUES ($1, $2, 'uploading', $3, $4, 0, $5, $6, $7, 'Connector rows normalized into staging', $8)
       ON CONFLICT (batch_id) DO UPDATE SET
         phase = CASE WHEN historical_attendance_import_progress.phase = 'draft' THEN 'uploading' ELSE historical_attendance_import_progress.phase END,
         total_rows = EXCLUDED.total_rows,
         processed_rows = EXCLUDED.processed_rows,
         failed_records = EXCLUDED.failed_records,
         warning_count = EXCLUDED.warning_count,
         progress_percent = EXCLUDED.progress_percent,
         message = EXCLUDED.message,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [
        tenantId,
        batchId,
        stats.total_rows,
        stats.staged_rows + stats.failed_rows,
        stats.failed_rows,
        stats.warning_count,
        progress,
        actorUserId,
      ],
    );
  }

  private async getSource(tenantId: string, sourceId: string): Promise<ConnectorSource> {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_sources
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, sourceId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import source not found');
    return rows[0];
  }

  private async getBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_batches
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, batchId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import batch not found');
    return rows[0];
  }

  private async persistConnectorProgress(
    tenantId: string,
    actorUserId: string,
    batchId: string,
    progress: {
      cursor: string | null;
      hasMore: boolean;
      sourceType: string;
      staged: number;
      failed: number;
      warnings: number;
      duplicates: number;
      total: number | null;
    },
  ) {
    await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = CASE WHEN $4::boolean THEN 'processing' ELSE status END,
           statistics = COALESCE(statistics, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        batchId,
        JSON.stringify({
          connectorCursor: progress.cursor,
          connectorHasMore: progress.hasMore,
          connectorSourceType: progress.sourceType,
          connectorTotalRecords: progress.total,
          lastChunk: {
            staged: progress.staged,
            failed: progress.failed,
            warnings: progress.warnings,
            duplicates: progress.duplicates,
          },
        }),
        progress.hasMore,
      ],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = CASE WHEN $4::boolean THEN 'processing' ELSE phase END,
           progress_percent = CASE
             WHEN $5::int IS NOT NULL AND $5::int > 0 THEN LEAST(99, ROUND((processed_rows::numeric / $5::numeric) * 100, 2))
             ELSE progress_percent
           END,
           message = $3,
           updated_by = $6,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [
        tenantId,
        batchId,
        progress.hasMore ? 'Connector chunk imported; more records available' : 'Connector import chunk completed',
        progress.hasMore,
        progress.total,
        actorUserId,
      ],
    );
  }
}
