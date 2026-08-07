import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class ScheduleInterviewDto {
  @IsDateString() scheduled_at!: string;
  @IsOptional() @IsString() conducted_by?: string;
}

export class SubmitExitInterviewDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) overall_rating?: number;
  @IsOptional() @IsString() reason_for_leaving?: string;
  @IsObject() responses!: Record<string, any>;
  @IsOptional() @IsBoolean() would_recommend?: boolean;
  @IsOptional() @IsString() suggestions?: string;
}

export class InterviewFeedbackDto {
  @IsString() feedback!: string;
}
