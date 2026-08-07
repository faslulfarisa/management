import {
  IsEnum, IsOptional, IsString, IsUUID, IsArray, IsBoolean, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  UPI = 'upi',
  CASH = 'cash',
  CHEQUE = 'cheque',
  NEFT = 'neft',
  IMPS = 'imps',
  RTGS = 'rtgs',
  /** Route the payout through Razorpay gateway (NEFT by default) */
  RAZORPAY = 'razorpay',
}

// Methods that require a bank account with account_number/IFSC
export const BANK_REQUIRED_METHODS = new Set<PaymentMethod>([
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.NEFT,
  PaymentMethod.IMPS,
  PaymentMethod.RTGS,
  PaymentMethod.RAZORPAY,
]);

/** Methods that are routed through the Razorpay gateway rather than processed manually */
export const RAZORPAY_GATEWAY_METHODS = new Set<PaymentMethod>([
  PaymentMethod.RAZORPAY,
]);

export class InitiatePaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @ApiPropertyOptional({ description: 'Override which bank account to use; defaults to the employee primary' })
  @IsOptional()
  @IsUUID()
  bank_account_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkInitiatePaymentsDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @ApiPropertyOptional({ type: [String], description: 'Subset of payslip UUIDs; omit to process all unpaid payslips in the run' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  payslip_ids?: string[];

  @ApiPropertyOptional({ description: 'Skip employees with invalid bank details instead of failing the whole batch' })
  @IsOptional()
  @IsBoolean()
  skip_invalid?: boolean;
}

export class MarkManualPaidDto {
  @ApiPropertyOptional({ description: 'UTR number, cheque number, receipt ID, or any reference. Optional for cash payments.' })
  @IsOptional()
  @IsString()
  transaction_reference?: string;

  @ApiProperty({ description: 'Date the payment was actually made (ISO 8601 date)', example: '2026-06-01' })
  @IsDateString()
  payment_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RetryPaymentDto {
  @ApiPropertyOptional({ description: 'Use a different bank account for the retry; defaults to the same account as the original' })
  @IsOptional()
  @IsUUID()
  bank_account_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReversePaymentDto {
  @ApiProperty({ description: 'Reason for reversal (mandatory for audit trail)' })
  @IsString()
  reason: string;
}
