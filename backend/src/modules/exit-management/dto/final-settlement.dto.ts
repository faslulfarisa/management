import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class ApproveSettlementDto {
  @IsString() @MinLength(5) reason!: string;
}

export class RejectSettlementDto {
  @IsString() @MinLength(5) reason!: string;
}

export class RecordPaymentDto {
  @IsOptional() @IsDateString() payment_date?: string;
}

export class ManualAdjustmentDto {
  @IsIn(['bonus', 'deductions', 'tax_deduction', 'loan_recovery']) field!: 'bonus' | 'deductions' | 'tax_deduction' | 'loan_recovery';
  @IsNumber() amount!: number;
  @IsString() @MinLength(5) reason!: string;
}
