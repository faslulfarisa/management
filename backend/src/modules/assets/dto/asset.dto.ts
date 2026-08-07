import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsIn, MinLength } from 'class-validator';

export class CreateAssetTypeDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsIn(['it_equipment', 'access_card', 'vehicle', 'furniture', 'sim_phone', 'other']) category?: string;
  @IsOptional() @IsBoolean() depreciation_applicable?: boolean;
}

export class CreateAssetItemDto {
  @IsString() asset_type_id!: string;
  @IsString() @MinLength(1) asset_code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsString() serial_number?: string;
  @IsOptional() @IsDateString() purchase_date?: string;
  @IsOptional() @IsNumber() purchase_value?: number;
  @IsOptional() @IsNumber() current_value?: number;
}

export class AssignAssetDto {
  @IsString() asset_item_id!: string;
  @IsString() employee_id!: string;
  @IsOptional() @IsDateString() expected_return_date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class RecordAssetReturnDto {
  @IsIn(['good', 'damaged', 'lost']) return_condition!: 'good' | 'damaged' | 'lost';
  @IsOptional() @IsNumber() recovery_amount?: number;
  @IsOptional() @IsString() notes?: string;
}
