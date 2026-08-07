import { IsString, IsBoolean, IsOptional, IsObject, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveReportDto {
  @ApiProperty({ example: 'Monthly Late Arrivals - HQ' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'attendance' })
  @IsString()
  category: string;

  @ApiProperty({ example: 'attendance/late-arrivals' })
  @IsString()
  report_key: string;

  @ApiProperty({ example: { branch_id: 'uuid', date_from: '2025-01-01' } })
  @IsObject()
  filters: Record<string, any>;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  is_shared?: boolean = false;
}
