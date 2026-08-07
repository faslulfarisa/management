import {
  IsArray, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkforcePlanBreakdownItemDto {
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() position_id?: string;
  @IsOptional() @IsInt() current_headcount?: number;
  @IsOptional() @IsInt() budgeted_headcount?: number;
  @IsOptional() @IsInt() planned_hires?: number;
  @IsOptional() @IsNumber() budget_amount?: number;
  @IsOptional() @IsString() justification?: string;
}

export class CreateWorkforcePlanDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsInt() @Min(2000) year!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkforcePlanBreakdownItemDto) breakdown?: WorkforcePlanBreakdownItemDto[];
}

export class UpdateWorkforcePlanDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsInt() @Min(2000) year?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkforcePlanBreakdownItemDto) breakdown?: WorkforcePlanBreakdownItemDto[];
}

export class ApproveWorkforcePlanDto {
  @IsString() @MinLength(5) reason!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class RejectWorkforcePlanDto {
  @IsString() @MinLength(5) reason!: string;
}

export class CloseWorkforcePlanDto {
  @IsOptional() @IsString() reason?: string;
}
