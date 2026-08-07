import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * Kept explicit rather than accepting a generic `changes` object so the global
 * ValidationPipe whitelist still applies to every supported request field.
 */
export class CreateChangeRequestDto {
  @IsOptional()
  @IsIn(['protected_field_change', 'additional_organization', 'plan_upgrade'])
  requestType?: 'protected_field_change' | 'additional_organization' | 'plan_upgrade';

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

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedBranchCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @IsString()
  otherDetails?: string;

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
