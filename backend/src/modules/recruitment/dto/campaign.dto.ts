import {
  IsArray, IsDateString, IsNumber, IsOptional, IsString, MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() campaign_type?: string;
  @IsOptional() @IsArray() vacancy_ids?: string[];
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @IsNumber() budget_amount?: number;
  @IsOptional() @IsNumber() actual_spend?: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() campaign_type?: string;
  @IsOptional() @IsArray() vacancy_ids?: string[];
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @IsNumber() budget_amount?: number;
  @IsOptional() @IsNumber() actual_spend?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() description?: string;
}

export class SetApplicationCampaignDto {
  @IsOptional() @IsString() campaign_id?: string | null;
}
