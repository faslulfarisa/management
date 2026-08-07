import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CANONICAL_RAW_PUNCH_SCHEMA_VERSION,
  CanonicalRawPunch,
  HistoricalAttendanceImportSourceType,
} from '../constants/historical-attendance-import.constants';

export interface ImportSourceRecord {
  id: string;
  source_type: HistoricalAttendanceImportSourceType;
  config?: Record<string, any>;
}

export interface NormalizedPunchResult {
  canonicalPunch: CanonicalRawPunch;
  warnings: string[];
  rowHash: string;
}

interface ImportSourceAdapter {
  readonly sourceType: HistoricalAttendanceImportSourceType;
  normalize(raw: Record<string, unknown>, source: ImportSourceRecord): NormalizedPunchResult;
}

const EMPLOYEE_KEYS = [
  'employeeIdentifier',
  'employee_identifier',
  'employeeCode',
  'employee_code',
  'empCode',
  'emp_code',
  'pin',
  'userId',
  'user_id',
  'badgeNumber',
  'badge_number',
];

const TIMESTAMP_KEYS = [
  'punchTimestamp',
  'punch_timestamp',
  'timestamp',
  'punchTime',
  'punch_time',
  'eventTime',
  'event_time',
  'logTime',
  'log_time',
  'dateTime',
  'datetime',
];

const DIRECTION_KEYS = ['punchDirection', 'punch_direction', 'direction', 'punchType', 'punch_type', 'type', 'status'];

function valueAt(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function applyFieldMappings(raw: Record<string, unknown>, source: ImportSourceRecord) {
  const mappings = source.config?.fieldMappings;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) return raw;

  const mapped = { ...raw };
  for (const [canonicalField, sourceField] of Object.entries(mappings)) {
    if (typeof sourceField === 'string' && raw[sourceField] !== undefined) {
      mapped[canonicalField] = raw[sourceField];
    }
  }
  return mapped;
}

function normalizeDirection(value: unknown): CanonicalRawPunch['punchDirection'] {
  const normalized = String(value ?? 'unknown').trim().toLowerCase().replace(/\s+/g, '_');
  if (['in', 'check_in', 'clock_in', 'punch_in', '0'].includes(normalized)) return 'in';
  if (['out', 'check_out', 'clock_out', 'punch_out', '1'].includes(normalized)) return 'out';
  if (['break_in', 'break_start', 'lunch_in'].includes(normalized)) return 'break_in';
  if (['break_out', 'break_end', 'lunch_out'].includes(normalized)) return 'break_out';
  return 'unknown';
}

function normalizeTimestamp(value: unknown, timezone?: string | null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value ?? '').trim();
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString();

  throw new BadRequestException(`Invalid punch timestamp${timezone ? ` for timezone ${timezone}` : ''}`);
}

abstract class BaseImportSourceAdapter implements ImportSourceAdapter {
  abstract readonly sourceType: HistoricalAttendanceImportSourceType;

  normalize(rawInput: Record<string, unknown>, source: ImportSourceRecord): NormalizedPunchResult {
    const raw = applyFieldMappings(rawInput, source);
    const warnings: string[] = [];
    const timezone = typeof source.config?.timezone === 'string' ? source.config.timezone : null;
    const employeeIdentifier = valueAt(raw, EMPLOYEE_KEYS);
    const timestamp = valueAt(raw, TIMESTAMP_KEYS);

    if (!employeeIdentifier) {
      throw new BadRequestException('Employee identifier is required for canonical punch normalization');
    }
    if (!timestamp) {
      throw new BadRequestException('Punch timestamp is required for canonical punch normalization');
    }

    const punchDirection = normalizeDirection(valueAt(raw, DIRECTION_KEYS));
    if (punchDirection === 'unknown') warnings.push('Punch direction could not be inferred');

    const canonicalPunch: CanonicalRawPunch = {
      schemaVersion: CANONICAL_RAW_PUNCH_SCHEMA_VERSION,
      sourceType: this.sourceType,
      sourceId: source.id,
      sourceRecordId: valueAt(raw, ['sourceRecordId', 'source_record_id', 'id', 'recordId', 'record_id'])?.toString() ?? null,
      employeeIdentifier: employeeIdentifier.toString(),
      punchTimestamp: normalizeTimestamp(timestamp, timezone),
      punchDirection,
      deviceIdentifier: valueAt(raw, ['deviceIdentifier', 'device_identifier', 'deviceId', 'device_id', 'deviceSn', 'serialNumber'])?.toString() ?? null,
      locationIdentifier: valueAt(raw, ['locationIdentifier', 'location_identifier', 'locationId', 'branchCode', 'siteCode'])?.toString() ?? null,
      verifyMethod: valueAt(raw, ['verifyMethod', 'verify_method', 'verification', 'authMode'])?.toString() ?? null,
      timezone,
      metadata: {
        adapter: this.sourceType,
        capturedFields: Object.keys(raw),
      },
    };

    const rowHash = createHash('sha256')
      .update(JSON.stringify({ sourceId: source.id, canonicalPunch }))
      .digest('hex');

    return { canonicalPunch, warnings, rowHash };
  }
}

class DeviceImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'device' as const;
}

class VendorSoftwareImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'vendor_software' as const;
}

class EasyTimeProImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'easytime_pro' as const;
}

class ZktecoImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'zkteco' as const;
}

class SqlDatabaseImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'sql_database' as const;
}

class SqlServerImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'sql_server' as const;
}

class PostgreSqlImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'postgresql' as const;
}

class MySqlImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'mysql' as const;
}

class RestApiImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'rest_api' as const;
}

class CsvImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'csv' as const;
}

class SdkImportSourceAdapter extends BaseImportSourceAdapter {
  readonly sourceType = 'sdk' as const;
}

@Injectable()
export class ImportSourceNormalizerService {
  private readonly adapters: Record<HistoricalAttendanceImportSourceType, ImportSourceAdapter> = {
    device: new DeviceImportSourceAdapter(),
    vendor_software: new VendorSoftwareImportSourceAdapter(),
    easytime_pro: new EasyTimeProImportSourceAdapter(),
    zkteco: new ZktecoImportSourceAdapter(),
    sql_database: new SqlDatabaseImportSourceAdapter(),
    sql_server: new SqlServerImportSourceAdapter(),
    postgresql: new PostgreSqlImportSourceAdapter(),
    mysql: new MySqlImportSourceAdapter(),
    rest_api: new RestApiImportSourceAdapter(),
    csv: new CsvImportSourceAdapter(),
    sdk: new SdkImportSourceAdapter(),
  };

  listSourceTypes() {
    return Object.keys(this.adapters);
  }

  normalize(raw: Record<string, unknown>, source: ImportSourceRecord) {
    const adapter = this.adapters[source.source_type];
    if (!adapter) throw new BadRequestException(`Unsupported historical import source type: ${source.source_type}`);
    return adapter.normalize(raw, source);
  }
}
