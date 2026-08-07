'use client';

import { useQuery } from '@tanstack/react-query';
import { profileApi, brandingAssetsApi } from '@/lib/company-profile-api';
import type { OrganizationProfile, BrandingAsset, AssetType } from '@/lib/company-profile-api';

export interface BrandingState {
  profile: OrganizationProfile | null;
  assets: Partial<Record<AssetType, BrandingAsset>> | null;
  logoUrl: string | null;
  squareLogoUrl: string | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useBranding(): BrandingState {
  const profileQuery = useQuery({
    queryKey: ['organization', 'profile'],
    queryFn: () => profileApi.get(),
    staleTime: 300_000,
  });

  const assetsQuery = useQuery({
    queryKey: ['organization', 'branding', 'assets'],
    queryFn: () => brandingAssetsApi.list(),
    staleTime: 300_000,
  });

  const profile = profileQuery.data ?? null;
  const assets = assetsQuery.data ?? null;
  const logoUrl =
    assets?.logo_rectangular?.file_url ??
    profile?.logo_url ??
    null;

  const squareLogoUrl =
    assets?.logo_square?.file_url ??
    logoUrl;

  return {
    profile,
    assets,
    logoUrl,
    squareLogoUrl,
    loading: profileQuery.isLoading || assetsQuery.isLoading,
    error: (profileQuery.error ?? assetsQuery.error) as Error | null,
    refetch: () => {
      profileQuery.refetch();
      assetsQuery.refetch();
    },
  };
}
