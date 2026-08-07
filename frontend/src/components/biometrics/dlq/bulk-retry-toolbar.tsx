'use client';

import { useState } from 'react';
import { biometricsApi } from '@/lib/biometrics-api';
import { Button } from '@/components/ui/button';

interface Props {
  selectedIds: string[];
  onComplete: () => void;
}

export function BulkRetryToolbar({ selectedIds, onComplete }: Props) {
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleBulkRetry = async () => {
    setLoading(true);
    try {
      await biometricsApi.bulkRetry(selectedIds);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200 text-sm">
      <span className="text-blue-700 font-medium">{selectedIds.length} job(s) selected</span>
      <Button
        size="sm"
        onClick={handleBulkRetry}
        disabled={loading}
      >
        {loading ? 'Retrying…' : `Retry ${selectedIds.length} job(s)`}
      </Button>
    </div>
  );
}
