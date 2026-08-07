import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsInt, IsNumber, Min, Max,
  MaxLength, IsISO8601, IsUUID,
} from 'class-validator';

const OFFER_TYPES = ['free_trial', 'discount_percent', 'discount_flat'];

export class CreateSignupOfferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(OFFER_TYPES)
  offerType: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsUUID()
  applicablePlanId?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSignupOfferDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(OFFER_TYPES)
  offerType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsUUID()
  applicablePlanId?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ToggleSignupOfferDto {
  @IsBoolean()
  isActive: boolean;
}

export class ValidateOfferCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
