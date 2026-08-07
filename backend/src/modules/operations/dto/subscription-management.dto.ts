import {
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const SUBSCRIPTION_SOURCES = ['catalog', 'custom', 'signup_offer', 'free_trial', 'free_plan', 'manual'] as const;
export const SUBSCRIPTION_MODES = ['catalog', 'custom'] as const;
export const BILLING_CYCLES = ['monthly', 'yearly'] as const;

export class AssignOpsSubscriptionDto {
  @IsIn(SUBSCRIPTION_MODES)
  mode: 'catalog' | 'custom';

  @ValidateIf((dto) => dto.mode === 'catalog')
  @IsUUID()
  planId?: string;

  @ValidateIf((dto) => dto.mode === 'custom')
  @IsString()
  @MaxLength(150)
  customPlanName?: string;

  @IsIn(BILLING_CYCLES)
  billingCycle: 'monthly' | 'yearly';

  @IsIn(SUBSCRIPTION_SOURCES)
  subscriptionSource: 'catalog' | 'custom' | 'signup_offer' | 'free_trial' | 'free_plan' | 'manual';

  @IsISO8601()
  currentPeriodStart: string;

  @IsISO8601()
  currentPeriodEnd: string;

  @IsISO8601()
  nextBillingDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedModules?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedFeatures?: string[];

  @IsOptional()
  @IsObject()
  resourceQuantities?: Record<string, number>;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsUUID()
  signupOfferRedemptionId?: string;
}

export class UpdateOpsSubscriptionDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_MODES)
  mode?: 'catalog' | 'custom';

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  customPlanName?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
  billingCycle?: 'monthly' | 'yearly';

  @IsOptional()
  @IsIn(SUBSCRIPTION_SOURCES)
  subscriptionSource?: 'catalog' | 'custom' | 'signup_offer' | 'free_trial' | 'free_plan' | 'manual';

  @IsOptional()
  @IsISO8601()
  currentPeriodStart?: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;

  @IsOptional()
  @IsISO8601()
  nextBillingDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedModules?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedFeatures?: string[];

  @IsOptional()
  @IsObject()
  resourceQuantities?: Record<string, number>;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsUUID()
  signupOfferRedemptionId?: string;
}

export class RenewOpsSubscriptionDto {
  @IsISO8601()
  currentPeriodStart: string;

  @IsISO8601()
  currentPeriodEnd: string;

  @IsISO8601()
  nextBillingDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class CancelOpsSubscriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
