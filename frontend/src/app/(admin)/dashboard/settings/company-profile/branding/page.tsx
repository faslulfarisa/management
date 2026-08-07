'use client';

import { useEffect, useState, useCallback } from 'react';
import { brandingAssetsApi } from '@/lib/company-profile-api';
import type { BrandingAsset } from '@/lib/company-profile-api';
import { BrandingAssetUploader } from '@/components/company-profile/BrandingAssetUploader';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';

interface Assets {
  logo_rectangular?: BrandingAsset;
  logo_square?: BrandingAsset;
}

export default function BrandingPage() {
  const [assets, setAssets] = useState<Assets>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(() => {
    brandingAssetsApi.list().then((data) => {
      setAssets(data as unknown as Assets);
    }).catch(() => setError('Failed to load branding assets.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive py-4">{error}</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Live preview */}
      {(assets.logo_rectangular || assets.logo_square) && (
        <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
          <CardContent className="p-5 flex items-center gap-5">
            {assets.logo_rectangular && (
              <img
                src={assets.logo_rectangular.file_url}
                alt="Rectangular logo"
                className="h-10 object-contain"
              />
            )}
            {assets.logo_square && (
              <img
                src={assets.logo_square.file_url}
                alt="Square logo"
                className="h-10 w-10 object-contain rounded-md"
              />
            )}
            <div>
              <p className="text-sm font-semibold">Logo active</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The rectangular logo is used on invoices, payslips, reports, and the navigation header.
                The square logo is used for compact slots and profile icons.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold mb-1">Company Logo</h2>
          <p className="text-xs text-muted-foreground mb-6">
            Upload both versions so the system picks the right shape for each context automatically.
          </p>

          {/* 3-col grid: rectangular spans 2, square spans 1 */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <BrandingAssetUploader
                assetType="logo_rectangular"
                label="Rectangular Logo"
                hint="Wide format · used on invoices, payslips, reports & navigation · PNG, JPEG, WEBP or SVG · max 5 MB"
                currentAsset={assets.logo_rectangular}
                onRefresh={loadAssets}
              />
            </div>
            <div className="col-span-1">
              <BrandingAssetUploader
                assetType="logo_square"
                label="Square Logo"
                hint="1:1 ratio · used for profile icons & compact spaces · PNG recommended · max 5 MB"
                currentAsset={assets.logo_square}
                onRefresh={loadAssets}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
