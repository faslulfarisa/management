import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsUUID } from 'class-validator';

export class CreateBankAccountDto {
  @IsUUID()
  employee_id: string;

  @IsString()
  @IsNotEmpty()
  account_holder_name: string;

  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @IsString()
  @IsNotEmpty()
  account_number: string;

  @IsString()
  @IsNotEmpty()
  ifsc_code: string;

  @IsIn(['savings', 'current', 'salary'])
  @IsOptional()
  account_type?: 'savings' | 'current' | 'salary';

  @IsString()
  @IsOptional()
  upi_id?: string;

  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @IsUUID()
  @IsOptional()
  branch_id?: string;
}

export class UpdateBankAccountDto {
  @IsString()
  @IsOptional()
  account_holder_name?: string;

  @IsString()
  @IsOptional()
  bank_name?: string;

  @IsString()
  @IsOptional()
  account_number?: string;

  @IsString()
  @IsOptional()
  ifsc_code?: string;

  @IsIn(['savings', 'current', 'salary'])
  @IsOptional()
  account_type?: 'savings' | 'current' | 'salary';

  @IsString()
  @IsOptional()
  upi_id?: string;
}

export class VerifyBankAccountDto {
  @IsIn(['verified', 'failed'])
  status: 'verified' | 'failed';

  @IsString()
  @IsOptional()
  verification_notes?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
