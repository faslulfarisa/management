import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * One optional property per entry in PROTECTED_ORG_FIELDS — kept explicit
 * (rather than a generic `changes` object) so the global ValidationPipe's
 * `forbidNonWhitelisted` whitelist still applies to each field individually.
 */
export class CreateChangeRequestDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  cinNumber?: string;

  @IsOptional()
  @IsString()
  companyType?: string;

  @IsString()
  @MinLength(10, { message: 'Please provide a reason of at least 10 characters' })
  reason: string;
}

const CHANGE_REQUEST_ACTIONS = ['approve', 'reject', 'request_documents'];

export class TransitionChangeRequestDto {
  @IsIn(CHANGE_REQUEST_ACTIONS)
  action: 'approve' | 'reject' | 'request_documents';

  @IsOptional()
  @IsString()
  notes?: string;
}
