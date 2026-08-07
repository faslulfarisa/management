import {
  IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength,
} from 'class-validator';

const SCOPES = ['company', 'employee'];
const CONFIDENTIALITY_LEVELS = ['public', 'internal', 'confidential', 'restricted'];

export class CreateComplianceDocumentDto {
  @IsIn(SCOPES) scope!: string;
  @IsOptional() @IsString() employee_id?: string;
  @IsString() category_id!: string;
  @IsString() document_type!: string;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() owner_id?: string;
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsDateString() issue_date?: string;
  @IsOptional() @IsDateString() expiry_date?: string;
  @IsOptional() @IsDateString() renewal_date?: string;
  @IsOptional() @IsInt() @Min(0) grace_period_days?: number;
  @IsOptional() @IsIn(CONFIDENTIALITY_LEVELS) confidentiality_level?: string;
  @IsOptional() @IsString() document_number?: string;
  @IsOptional() @IsString() issuing_authority?: string;
  @IsOptional() @IsObject() extra_fields?: Record<string, any>;
  @IsOptional() @IsString() remarks?: string;
  // First-version file metadata, set after FileUploadService.uploadDocument()
  @IsOptional() @IsString() file_url?: string;
  @IsOptional() @IsString() file_name?: string;
  @IsOptional() @IsInt() file_size_bytes?: number;
  @IsOptional() @IsString() mime_type?: string;
}

export class UpdateComplianceDocumentDto {
  @IsOptional() @IsString() category_id?: string;
  @IsOptional() @IsString() document_type?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() owner_id?: string;
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsDateString() issue_date?: string;
  @IsOptional() @IsDateString() expiry_date?: string;
  @IsOptional() @IsDateString() renewal_date?: string;
  @IsOptional() @IsInt() @Min(0) grace_period_days?: number;
  @IsOptional() @IsIn(CONFIDENTIALITY_LEVELS) confidentiality_level?: string;
  @IsOptional() @IsString() document_number?: string;
  @IsOptional() @IsString() issuing_authority?: string;
  @IsOptional() @IsObject() extra_fields?: Record<string, any>;
  @IsOptional() @IsString() remarks?: string;
}

export class UploadVersionDto {
  @IsString() file_url!: string;
  @IsOptional() @IsString() file_name?: string;
  @IsOptional() @IsInt() file_size_bytes?: number;
  @IsOptional() @IsString() mime_type?: string;
  @IsOptional() @IsString() change_note?: string;
}

export class RestoreVersionDto {
  @IsInt() version_number!: number;
}

export class ApproveDocumentDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectDocumentDto {
  @IsString() @MinLength(5) reason!: string;
}
