import {
  IsBoolean, IsDateString, IsEmail, IsOptional, IsString,
} from 'class-validator';

/**
 * All fields optional — EmployeeConversionService prefills from candidate +
 * offer + vacancy + preboarding data, and only what HR supplies here
 * overrides the prefill before EmployeeService.create() is called.
 */
export class ConvertToEmployeeDto {
  @IsOptional() @IsString() employee_code?: string;

  @IsOptional() @IsString() first_name?: string;
  @IsOptional() @IsString() last_name?: string;
  @IsOptional() @IsEmail() personal_email?: string;
  @IsOptional() @IsString() personal_phone?: string;

  @IsOptional() @IsString() branch_id?: string;
  @IsOptional() @IsString() department_id?: string;
  @IsOptional() @IsString() designation_id?: string;
  @IsOptional() @IsString() position_id?: string;
  @IsOptional() @IsString() employment_type_id?: string;
  @IsOptional() @IsString() reporting_manager_id?: string;

  @IsOptional() @IsDateString() date_of_joining?: string;
  @IsOptional() @IsDateString() probation_end_date?: string;

  @IsOptional() @IsString() bank_name?: string;
  @IsOptional() @IsString() bank_account_number?: string;
  @IsOptional() @IsString() ifsc_code?: string;
  @IsOptional() @IsString() account_type?: string;
  @IsOptional() @IsString() upi_id?: string;

  @IsOptional() emergency_contact?: { name?: string; relationship?: string; phone?: string; address?: string };

  @IsOptional() @IsBoolean() enable_login?: boolean;
  @IsOptional() @IsEmail() login_email?: string;
  @IsOptional() @IsString() login_password?: string;
  @IsOptional() @IsString() login_role?: string;
}
