import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertVerificationDto {
  @IsIn(['reference', 'employment', 'education', 'identity', 'address', 'background'])
  verification_type!: string;

  @IsOptional() @IsIn(['pending', 'in_progress', 'verified', 'failed', 'not_applicable']) status?: string;
  @IsOptional() @IsObject() details?: Record<string, any>;
  @IsOptional() @IsString() comments?: string;
}
