import { IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FeatureOverrideItemDto {
  @IsIn(['module', 'feature'])
  entityType!: 'module' | 'feature';

  @IsUUID()
  entityId!: string;

  @IsIn(['enabled', 'disabled', 'inherit'])
  state!: 'enabled' | 'disabled' | 'inherit';
}

export class UpdateOrganizationFeatureOverridesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureOverrideItemDto)
  overrides!: FeatureOverrideItemDto[];

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SaveFeatureTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureOverrideItemDto)
  overrides!: FeatureOverrideItemDto[];
}

export class ApplyFeatureTemplateDto {
  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
