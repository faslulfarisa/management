import {
  IsDateString, IsIn, IsOptional, IsString, MinLength,
} from 'class-validator';

export class UpdatePreboardingItemDto {
  @IsIn(['pending', 'completed', 'not_applicable'])
  status!: string;

  @IsOptional() @IsString() notes?: string;
}

export class UpdateJoiningDateDto {
  @IsDateString() joining_date!: string;
}

// ── Public Career Portal (email-matched, no login) ─────────────────────
export class SubmitBankDetailsDto {
  @IsString() email!: string;
  @IsOptional() @IsString() bank_name?: string;
  @IsOptional() @IsString() bank_account_number?: string;
  @IsOptional() @IsString() ifsc_code?: string;
  @IsOptional() @IsString() account_type?: string;
  @IsOptional() @IsString() upi_id?: string;
}

export class SubmitEmergencyContactDto {
  @IsString() email!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() relationship?: string;
  @IsString() @MinLength(1) phone!: string;
  @IsOptional() @IsString() address?: string;
}

export class AcceptNdaDto {
  @IsString() email!: string;
}

export class CandidatePreboardingQueryDto {
  @IsString() email!: string;
}

export interface BankDetails {
  bank_name?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  account_type?: string;
  upi_id?: string;
}

export interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  address?: string;
}
