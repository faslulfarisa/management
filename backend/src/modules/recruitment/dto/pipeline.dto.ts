import {
  IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength,
} from 'class-validator';

// ── Pipeline stage configuration ──────────────────────────────────────────
export class CreatePipelineStageDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsIn(['screening', 'assessment', 'interview', 'evaluation', 'offer', 'custom']) stage_category?: string;
  @IsInt() stage_order!: number;
  @IsOptional() @IsString() color?: string;
}

export class UpdatePipelineStageDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(['screening', 'assessment', 'interview', 'evaluation', 'offer', 'custom']) stage_category?: string;
  @IsOptional() @IsInt() stage_order?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() is_active?: boolean;
}

export class MoveApplicationStageDto {
  @IsString() to_stage_id!: string;
  @IsOptional() @IsString() comment?: string;
}

// ── HR Screening ───────────────────────────────────────────────────────────
export class UpsertScreeningDto {
  @IsOptional() @IsNumber() current_salary?: number;
  @IsOptional() @IsNumber() expected_salary?: number;
  @IsOptional() @IsInt() notice_period_days?: number;
  @IsOptional() @IsDateString() availability_date?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) communication_rating?: number;
  @IsOptional() @IsIn(['proceed', 'hold', 'reject']) recommendation?: string;
  @IsOptional() @IsString() notes?: string;
}

// ── Assessments ────────────────────────────────────────────────────────────
export class CreateAssessmentDto {
  @IsOptional() @IsIn(['technical', 'coding', 'assignment', 'case_study', 'language_test', 'other']) assessment_type?: string;
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsDateString() due_at?: string;
  @IsOptional() @IsNumber() max_score?: number;
}

export class UpdateAssessmentDto {
  @IsOptional() @IsIn(['assigned', 'in_progress', 'submitted', 'evaluated', 'cancelled']) status?: string;
  @IsOptional() @IsNumber() score?: number;
  @IsOptional() @IsIn(['pass', 'fail']) result?: string;
  @IsOptional() @IsString() evaluation_notes?: string;
}

// ── Evaluations ────────────────────────────────────────────────────────────
export class CreateEvaluationDto {
  @IsOptional() @IsString() interview_id?: string;
  @IsOptional() @IsIn(['technical', 'hr', 'behavioural', 'communication', 'leadership', 'culture_fit', 'other']) evaluation_type?: string;
  @IsOptional() @IsArray() ratings?: { criteria: string; score: number; max_score?: number; comment?: string }[];
  @IsOptional() @IsNumber() overall_rating?: number;
  @IsOptional() @IsString() strengths?: string;
  @IsOptional() @IsString() concerns?: string;
  @IsOptional() @IsIn(['strong_yes', 'yes', 'neutral', 'no', 'strong_no']) recommendation?: string;
}

// ── Communication templates ───────────────────────────────────────────────
export class CreateCommunicationTemplateDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsIn(['interview_invite', 'rejection', 'offer', 'reminder', 'custom']) category?: string;
  @IsString() @MinLength(1) subject!: string;
  @IsString() @MinLength(1) body!: string;
}

export class UpdateCommunicationTemplateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(['interview_invite', 'rejection', 'offer', 'reminder', 'custom']) category?: string;
  @IsOptional() @IsString() @MinLength(1) subject?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() is_active?: boolean;
}

export class SendCommunicationDto {
  @IsOptional() @IsIn(['email', 'sms', 'whatsapp', 'phone_note', 'internal_note']) channel?: string;
  @IsOptional() @IsString() template_id?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
}
