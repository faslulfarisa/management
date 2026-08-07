import { Transform } from 'class-transformer';
import { IsUUID, IsNotEmpty, IsDateString, IsOptional, IsString, IsArray, IsIn, IsInt, Min, IsObject } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => value === '' ? undefined : value;

export class CreateShiftOverrideRequestDto {
  @Transform(emptyToUndefined)
  @IsUUID()
  @IsOptional()
  employee_id?: string;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @Transform(emptyToUndefined)
  @IsUUID()
  @IsOptional()
  current_shift_id?: string;

  @IsString()
  @IsNotEmpty()
  reason_category: string;

  @IsString()
  @IsNotEmpty()
  detailed_reason: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  supporting_documents?: string[];

  @IsString()
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  urgency?: string;

  @IsString()
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsString()
  @IsOptional()
  @IsIn(['assign_replacement', 'swap_shift', 'move_shift', 'convert_to_leave', 'cancel_shift', 'manager_decision'])
  preferred_action?: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class ApproveShiftOverrideRequestDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['assign_replacement', 'move_shift', 'convert_to_leave', 'cancel_shift', 'split_shift', 'temporary_shift', 'override_hours'])
  action_type: string;

  @Transform(emptyToUndefined)
  @IsUUID()
  @IsOptional()
  replacement_employee_id?: string;

  @Transform(emptyToUndefined)
  @IsUUID()
  @IsOptional()
  target_shift_id?: string;

  @IsString()
  @IsOptional()
  custom_start_time?: string;

  @IsString()
  @IsOptional()
  custom_end_time?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  custom_break_minutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  custom_grace_period_minutes?: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
