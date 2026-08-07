import { IsString, IsOptional, IsIn, IsObject, IsArray, IsNumber } from 'class-validator';

export class ExportRequestDto {
  @IsString()
  module: string;

  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsIn(['all', 'filtered'])
  scope?: 'all' | 'filtered';

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
