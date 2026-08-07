import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const SCOPES = ['company', 'employee'];

export class CreateCategoryDto {
  @IsIn(SCOPES) scope!: string;
  @IsString() @MinLength(2) group_label!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) code!: string;
  @IsOptional() @IsArray() extra_field_schema?: any[];
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() group_label?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsArray() extra_field_schema?: any[];
}
