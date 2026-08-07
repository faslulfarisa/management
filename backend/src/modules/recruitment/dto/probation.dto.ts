import {
  IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MinLength,
} from 'class-validator';

export class CreateProbationReviewDto {
  @IsString() employee_id!: string;
  @IsOptional() @IsString() application_id?: string;
  @IsOptional() @IsArray() goals?: { description: string; target_date?: string }[];
  @IsOptional() @IsDateString() probation_end_date?: string;
  @IsOptional() @IsString() reviewer_id?: string;
}

export class AddGoalDto {
  @IsString() @MinLength(1) description!: string;
  @IsOptional() @IsDateString() target_date?: string;
}

export class AddReviewEntryDto {
  @IsIn(['manager', 'hr'])
  type!: 'manager' | 'hr';

  @IsString() @MinLength(1) feedback!: string;
  @IsOptional() @IsNumber() rating?: number;
}

export class SetRecommendationDto {
  @IsIn(['confirm', 'extend', 'terminate'])
  recommendation!: 'confirm' | 'extend' | 'terminate';

  @IsOptional() @IsString() recommendation_notes?: string;
  @IsOptional() @IsDateString() extended_probation_end_date?: string;
}

export class ApproveProbationDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectProbationDto {
  @IsString() @MinLength(5) reason!: string;
}
