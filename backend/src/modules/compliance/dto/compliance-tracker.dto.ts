import { IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateTrackerItemDto {
  @IsOptional() @IsString() branch_id?: string;
  @IsString() compliance_type!: string;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @IsString() responsible_user_id?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) completion_percent?: number;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateTrackerItemDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @IsString() responsible_user_id?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) completion_percent?: number;
  @IsOptional() @IsString() remarks?: string;
}
