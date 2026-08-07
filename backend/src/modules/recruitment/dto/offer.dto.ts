import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString, MinLength,
} from 'class-validator';

export class CreateOfferDto {
  @IsString() application_id!: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() employment_type_id?: string;
  @IsOptional() @IsDateString() joining_date?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() ctc?: number;
  @IsOptional() @IsArray() salary_components?: { name: string; amount: number; frequency?: string }[];
  @IsOptional() @IsArray() benefits?: string[];
  @IsOptional() @IsString() offer_letter_content?: string;
}

export class UpdateOfferDto {
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() employment_type_id?: string;
  @IsOptional() @IsDateString() joining_date?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsNumber() ctc?: number;
  @IsOptional() @IsArray() salary_components?: { name: string; amount: number; frequency?: string }[];
  @IsOptional() @IsArray() benefits?: string[];
  @IsOptional() @IsString() offer_letter_content?: string;
  @IsOptional() @IsString() change_note?: string;
}

export class ApproveOfferDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectOfferDto {
  @IsString() @MinLength(5) reason!: string;
}

export class SendOfferDto {
  @IsOptional() @IsDateString() expires_at?: string;
}

export class WithdrawOfferDto {
  @IsOptional() @IsString() reason?: string;
}

export class AddNegotiationDto {
  @IsString() @MinLength(1) note!: string;
  @IsOptional() @IsNumber() proposed_ctc?: number;
  @IsOptional() @IsDateString() proposed_joining_date?: string;
}

// ── Public Career Portal (email-matched, no login) ─────────────────────
export class AcceptOfferDto {
  @IsString() email!: string;
}

export class CandidateDeclineOfferDto {
  @IsString() email!: string;
  @IsOptional() @IsString() reason?: string;
}

export class CandidateNegotiationDto {
  @IsString() email!: string;
  @IsString() @MinLength(1) note!: string;
  @IsOptional() @IsNumber() proposed_ctc?: number;
  @IsOptional() @IsDateString() proposed_joining_date?: string;
}
