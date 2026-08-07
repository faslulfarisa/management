import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';

export interface RequiredFeatureMetadata {
  module: string;
  feature?: string;
}

export const RequireFeature = (module: string, feature?: string) =>
  SetMetadata(FEATURE_KEY, { module, feature } satisfies RequiredFeatureMetadata);
