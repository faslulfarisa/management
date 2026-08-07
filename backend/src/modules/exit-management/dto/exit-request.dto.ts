import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const REQUEST_TYPES = ['resignation', 'retirement', 'termination', 'contract_completion', 'mutual_separation', 'absconding'];

export class SubmitExitRequestDto {
  @IsOptional() @IsString() employee_id?: string; // ignored on self-service routes — server resolves from JWT
  @IsIn(REQUEST_TYPES) request_type!: string;
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsString() detailed_comments?: string;
  @IsOptional() @IsInt() @Min(0) notice_period_days?: number;
  @IsDateString() requested_date!: string;
  @IsOptional() @IsDateString() last_working_date?: string;
  @IsOptional() @IsString() attachment_url?: string;
}

export class ApproveExitRequestDto {
  @IsString() @MinLength(5) reason!: string;
}

export class RejectExitRequestDto {
  @IsString() @MinLength(5) reason!: string;
}

export class WithdrawExitRequestDto {
  @IsString() @MinLength(3) reason!: string;
}
