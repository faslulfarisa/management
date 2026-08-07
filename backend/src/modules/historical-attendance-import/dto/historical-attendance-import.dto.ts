import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  HISTORICAL_ATTENDANCE_IMPORT_SOURCE_TYPES,
  HISTORICAL_ATTENDANCE_IMPORT_STATUSES,
  HISTORICAL_ATTENDANCE_EMPLOYEE_IDENTIFIER_TYPES,
  HistoricalAttendanceEmployeeIdentifierType,
  HistoricalAttendanceImportSourceType,
  HistoricalAttendanceImportStatus,
} from '../constants/historical-attendance-import.constants';

export class CreateImportSourceDto {
  @IsIn(HISTORICAL_ATTENDANCE_IMPORT_SOURCE_TYPES)
  source_type!: HistoricalAttendanceImportSourceType;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateImportSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateImportBatchDto {
  @IsString()
  source_id!: string;

  @IsDateString()
  date_from!: string;

  @IsDateString()
  date_to!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateImportBatchStatusDto {
  @IsIn(HISTORICAL_ATTENDANCE_IMPORT_STATUSES)
  status!: HistoricalAttendanceImportStatus;

  @IsOptional()
  @IsString()
  message?: string;
}

export class CreateImportMappingDto {
  @IsOptional()
  @IsString()
  source_id?: string;

  @IsOptional()
  @IsString()
  batch_id?: string;

  @IsOptional()
  @IsIn(['field_mapping', 'value_mapping', 'timezone', 'identifier_hint'])
  mapping_type?: 'field_mapping' | 'value_mapping' | 'timezone' | 'identifier_hint';

  @IsString()
  source_field!: string;

  @IsString()
  canonical_field!: string;

  @IsOptional()
  @IsObject()
  transform_config?: Record<string, unknown>;
}

export class RawStagingPunchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  row_number?: number;

  @IsObject()
  raw_payload!: Record<string, unknown>;
}

export class AddStagingRowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RawStagingPunchDto)
  rows!: RawStagingPunchDto[];
}

export class ImportListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(HISTORICAL_ATTENDANCE_IMPORT_STATUSES)
  status?: HistoricalAttendanceImportStatus;
}

export class UpdateHistoricalImportCapabilityDto {
  @IsBoolean()
  enabled!: boolean;
}

export class AutoMatchBatchDto {
  @IsOptional()
  @IsBoolean()
  approveHighConfidence?: boolean;
}

export class ManualEmployeeMappingDto {
  @IsIn(HISTORICAL_ATTENDANCE_EMPLOYEE_IDENTIFIER_TYPES)
  source_identifier_type!: HistoricalAttendanceEmployeeIdentifierType;

  @IsString()
  @MinLength(1)
  source_identifier!: string;

  @IsString()
  employee_id!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MappingDecisionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class EmployeeSearchQueryDto {
  @IsString()
  @MinLength(1)
  search!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}

export class ImportPreviewQueryDto extends ImportListQueryDto {
  @IsOptional()
  @IsIn([
    'valid',
    'warnings',
    'errors',
    'duplicates',
    'unknown',
    'mapped',
    'rejected',
    'create',
    'update',
    'unchanged',
    'conflicts',
  ])
  bucket?:
    | 'valid'
    | 'warnings'
    | 'errors'
    | 'duplicates'
    | 'unknown'
    | 'mapped'
    | 'rejected'
    | 'create'
    | 'update'
    | 'unchanged'
    | 'conflicts';
}

export class ReconcileAttendancePreviewDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  toleranceMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourcePriority?: string[];
}

export class CreateAttendanceRebuildSummaryDto {
  @IsOptional()
  @IsBoolean()
  includeUnchanged?: boolean;
}

export class CommitAttendanceRebuildDto {
  @IsString()
  summaryRunId!: string;
}

export class ImportLifecycleActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RollbackImportCommitDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ConnectorReadDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxChunks?: number;

  @IsOptional()
  @IsString()
  csvContent?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  records?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  configOverride?: Record<string, unknown>;
}

export class ConnectorConfigTestDto {
  @IsOptional()
  @IsObject()
  configOverride?: Record<string, unknown>;
}
