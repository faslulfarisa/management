import { IsEmail, IsNotEmpty, IsString, IsOptional, IsBoolean, MinLength, MaxLength, Matches, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.com' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AdminLoginDto extends LoginDto {
  @ApiProperty({ example: 'ABC001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  companyCode: string;
}

export class SelectTenantDto {
  @ApiProperty({ example: 'tenant-uuid-here' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@hotel.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit reset code from email' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Reset code must be exactly 6 digits' })
  otp: string;

  @ApiProperty({ description: 'New password (min 8 chars, must include uppercase, lowercase, and digit)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must be at most 128 characters' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class MfaVerifyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class MfaDisableDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class MfaSetupDto {
  @ApiProperty({ description: "Current account password, required to (re)generate a TOTP secret/QR code" })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RecoveryCodesRegenerateDto {
  @ApiProperty({ description: 'Current account password, required to regenerate recovery codes' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ChangePasswordVerifyDto {
  @ApiProperty({ description: 'Session id returned by /auth/login when requiresPasswordChange is true' })
  @IsUUID()
  @IsNotEmpty()
  changeSessionId: string;

  // Intentionally not regex-validated here — AuthService.verifyPasswordChange()
  // checks the live password policy (shared/credential-generator.util.ts) so a
  // future policy change takes effect without touching this DTO.
  @ApiProperty({ description: 'New password — must satisfy the current password policy' })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class MfaLoginVerifyDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  loginSessionId: string;

  @ApiProperty({ required: false, description: '6-digit TOTP code from the authenticator app' })
  @ValidateIf((o) => !o.recoveryCode)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be exactly 6 digits' })
  token?: string;

  @ApiProperty({ required: false, description: 'One-time recovery code, format XXXX-XXXX' })
  @ValidateIf((o) => !o.token)
  @IsString()
  @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, { message: 'Recovery code must be in the format XXXX-XXXX' })
  recoveryCode?: string;

  @ApiProperty({ required: false, description: 'Trust this device for 30 days, skipping MFA on subsequent logins' })
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
