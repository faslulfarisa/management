import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClearanceDto {
  @IsString() @MinLength(2) department!: string;
  @IsOptional() @IsBoolean() is_mandatory?: boolean;
  @IsOptional() @IsDateString() due_date?: string;
}

export class UpdateClearanceDto {
  @IsIn(['pending', 'in_review', 'cleared', 'rejected', 'returned', 'blocked']) status!: string;
  @IsOptional() @IsString() remarks?: string;
}
