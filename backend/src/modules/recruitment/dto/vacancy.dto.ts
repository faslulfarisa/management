import {
  IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength,
} from 'class-validator';

export class CreateVacancyDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() position_id?: string;
  @IsOptional() @IsString() hiring_manager_id?: string;
  @IsOptional() @IsString() recruiter_id?: string;
  @IsOptional() @IsString() reporting_manager_id?: string;
  @IsOptional() @IsString() employment_type_id?: string;
  @IsOptional() @IsNumber() experience_min_years?: number;
  @IsOptional() @IsNumber() experience_max_years?: number;
  @IsOptional() @IsString() qualification?: string;
  @IsOptional() @IsNumber() salary_min?: number;
  @IsOptional() @IsNumber() salary_max?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(1) number_of_positions?: number;
  @IsOptional() @IsDateString() target_start_date?: string;
  @IsOptional() @IsDateString() target_close_date?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() justification?: string;
}

export class UpdateVacancyDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() position_id?: string;
  @IsOptional() @IsString() hiring_manager_id?: string;
  @IsOptional() @IsString() recruiter_id?: string;
  @IsOptional() @IsString() reporting_manager_id?: string;
  @IsOptional() @IsString() employment_type_id?: string;
  @IsOptional() @IsNumber() experience_min_years?: number;
  @IsOptional() @IsNumber() experience_max_years?: number;
  @IsOptional() @IsString() qualification?: string;
  @IsOptional() @IsNumber() salary_min?: number;
  @IsOptional() @IsNumber() salary_max?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsInt() @Min(1) number_of_positions?: number;
  @IsOptional() @IsDateString() target_start_date?: string;
  @IsOptional() @IsDateString() target_close_date?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() justification?: string;
}

export class ApproveVacancyDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectVacancyDto {
  @IsString() @MinLength(5) reason!: string;
}

export class CloseVacancyDto {
  @IsOptional() @IsString() reason?: string;
}

export class ReopenVacancyDto {
  @IsOptional() @IsString() reason?: string;
}

export class ArchiveVacancyDto {
  @IsOptional() @IsString() reason?: string;
}

export class AddVacancyCommentDto {
  @IsString() @MinLength(1) comment!: string;
}
