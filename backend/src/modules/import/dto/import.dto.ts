import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { DuplicateStrategy } from '../import-registry.service';

export class CreateImportPreviewDto {
  @IsOptional()
  @IsString()
  module?: string;
}

export class RemapImportDto {
  @IsObject()
  mappings: Record<string, string>;

  @IsOptional()
  @IsArray()
  rows?: Array<Record<string, unknown>>;
}

export class ConfirmImportDto {
  @IsOptional()
  @IsIn(['skip', 'update', 'insert', 'merge'])
  conflictStrategy?: DuplicateStrategy;

  @IsOptional()
  @IsBoolean()
  ignoreEmptyValues?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;
}
