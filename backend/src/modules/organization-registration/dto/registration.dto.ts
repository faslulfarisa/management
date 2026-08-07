import {
  IsEmail, IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, IsInt, Min,
  MinLength, MaxLength, Matches, ValidateNested, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

const COMPANY_TYPES = [
  'private_limited', 'public_limited', 'llp', 'partnership',
  'sole_proprietorship', 'ngo', 'government', 'other',
];

const COMPANY_SIZES = ['1-50', '51-200', '201-500', '501-1000', '1000+'];

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

/** Shared base for every endpoint that operates on an in-flight pending_registrations row. */
export class RegistrationSessionDto {
  @IsUUID()
  registrationId: string;

  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

// Email-link verification only needs the link's own token — it's clicked
// from an email client, possibly on a different device than the wizard
// session that holds the access token.
export class VerifyEmailDto {
  @IsUUID()
  registrationId: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}

export class VerifyMobileDto extends RegistrationSessionDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  postal_code: string;
}

export class SubmitOrganizationDto extends RegistrationSessionDto {
  // Organization information
  @IsString()
  @IsNotEmpty()
  legalName: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsIn(COMPANY_TYPES)
  companyType: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  panNumber?: string;

  @IsOptional()
  @IsString()
  cinNumber?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsEmail()
  corporateEmail: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  // Address information
  @ValidateNested()
  @Type(() => AddressDto)
  registeredAddress: AddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  operationalAddress?: AddressDto;

  // Business information
  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedBranchCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  @IsOptional()
  @IsString()
  currentHrSystem?: string;

  @IsOptional()
  @IsIn(COMPANY_SIZES)
  companySize?: string;

  @IsOptional()
  @IsBoolean()
  payrollRequirement?: boolean;

  @IsOptional()
  @IsBoolean()
  attendanceRequirement?: boolean;

  @IsOptional()
  @IsBoolean()
  biometricRequirement?: boolean;

  @IsOptional()
  @IsBoolean()
  recruitmentRequirement?: boolean;

  @IsOptional()
  @IsBoolean()
  performanceRequirement?: boolean;

  // Primary contact
  @IsString()
  @IsNotEmpty()
  contactPersonName: string;

  @IsString()
  @IsNotEmpty()
  contactDesignation: string;

  @IsString()
  @IsNotEmpty()
  contactPersonMobile: string;

  @IsEmail()
  contactPersonEmail: string;

  // Optional signup offer selected (or promo-code-resolved) in the wizard's
  // review step — re-validated server-side regardless of how it was chosen.
  @IsOptional()
  @IsUUID()
  offerId?: string;
}
