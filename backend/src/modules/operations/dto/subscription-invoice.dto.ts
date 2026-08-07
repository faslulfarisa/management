import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const SUBSCRIPTION_INVOICE_STATUSES = ['pending', 'paid', 'void', 'overdue'] as const;

export class CreateSubscriptionInvoiceDto {
  @IsUUID()
  tenantId: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsISO8601()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSubscriptionInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoiceNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkSubscriptionInvoicePaidDto {
  @IsString()
  @MaxLength(80)
  paymentMethod: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  gateway?: string;
}

export class VoidSubscriptionInvoiceDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ListSubscriptionInvoicesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(SUBSCRIPTION_INVOICE_STATUSES)
  status?: 'pending' | 'paid' | 'void' | 'overdue';

  @IsOptional()
  @IsIn(['overdue', 'due_7', 'due_30'])
  dueWindow?: 'overdue' | 'due_7' | 'due_30';

  @IsOptional()
  @ValidateIf((dto) => dto.tenantId !== '')
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
