import { IsOptional, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReportFilterDto {
  @ApiProperty({ example: '2025-01-01', required: false })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiProperty({ example: '2025-01-31', required: false })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  branch_id?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  department_id?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  employee_id?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  shift_id?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  designation_id?: string;

  @ApiProperty({ example: 'present', required: false, enum: ['present', 'absent', 'late', 'half_day', 'on_leave'] })
  @IsOptional()
  @IsString()
  attendance_status?: string;

  @ApiProperty({ example: 'inactive', required: false, enum: ['inactive', 'locked', 'suspended', 'resigned', 'terminated', 'retired', 'on_leave'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 'face', required: false, enum: ['fingerprint', 'face', 'card', 'password', 'hybrid', 'other'] })
  @IsOptional()
  @IsString()
  verification_method?: string;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiProperty({ example: 6, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  payroll_month?: number;

  @ApiProperty({ example: 2025, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  payroll_year?: number;

  @ApiProperty({ example: 'uuid', required: false })
  @IsOptional()
  @IsString()
  leave_type_id?: string;

  @ApiProperty({ example: 'uuid', required: false, description: 'Performance review cycle id' })
  @IsOptional()
  @IsString()
  cycle_id?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 50, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}
