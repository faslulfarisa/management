import { IsString, IsDateString, IsUUID, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOtRequestDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employee_id: string;

  @ApiProperty({ description: 'Date of overtime work (YYYY-MM-DD)' })
  @IsDateString()
  ot_date: string;

  @ApiPropertyOptional({ description: 'Shift UUID (optional)' })
  @IsOptional()
  @IsUUID()
  shift_id?: string;

  @ApiProperty({ description: 'Requested overtime hours (0.5–12)', minimum: 0.5, maximum: 12 })
  @IsNumber()
  @Min(0.5)
  @Max(12)
  requested_hours: number;

  @ApiProperty({ description: 'Reason / justification for overtime' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Supporting notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OtRequestFiltersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employee_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  month?: string;

  @ApiPropertyOptional()
  @IsOptional()
  year?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: string;
}
