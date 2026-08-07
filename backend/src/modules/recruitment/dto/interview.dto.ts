import {
  IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MinLength,
} from 'class-validator';

export class ScheduleInterviewDto {
  @IsString() application_id!: string;
  @IsOptional() @IsIn(['technical', 'hr', 'managerial', 'final', 'other']) round_type?: string;
  @IsOptional() @IsInt() @Min(1) round_number?: number;
  @IsOptional() @IsIn(['phone', 'video', 'in_person']) interview_type?: string;
  @IsDateString() scheduled_at!: string;
  @IsOptional() @IsInt() @Min(1) duration_minutes?: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() meeting_link?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) panel_member_ids?: string[];
  /** Kept for backward compat with the legacy single-interviewer flow. */
  @IsOptional() @IsString() interviewer_id?: string;
}

export class RescheduleInterviewDto {
  @IsDateString() scheduled_at!: string;
  @IsOptional() @IsString() reason?: string;
}

export class CancelInterviewDto {
  @IsOptional() @IsString() reason?: string;
}

export class SubmitInterviewFeedbackDto {
  @IsInt() @Min(1) rating!: number;
  @IsOptional() @IsIn(['strong_yes', 'yes', 'neutral', 'no', 'strong_no']) recommendation?: string;
  @IsOptional() @IsString() comments?: string;
}

export class CompleteInterviewDto {
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsInt() @Min(1) rating?: number;
  @IsOptional() @IsString() recommendation?: string;
}

export class UpdateInterviewDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsInt() rating?: number;
  @IsOptional() @IsString() recommendation?: string;
  @IsOptional() @MinLength(2) @IsString() title?: string;
}
