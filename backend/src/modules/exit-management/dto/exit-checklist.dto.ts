import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString() @MinLength(2) item!: string;
  @IsString() @MinLength(2) department!: string;
  @IsOptional() @IsString() assigned_to?: string;
  @IsOptional() @IsBoolean() is_mandatory?: boolean;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsDateString() due_date?: string;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsIn(['pending', 'completed']) status?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() assigned_to?: string;
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
}
