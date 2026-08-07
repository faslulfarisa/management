'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/use-permissions';
import type { ImportConfig } from './types';
import { ImportDialog } from './ImportDialog';

interface ImportButtonProps {
  config?: ImportConfig;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  iconOnly?: boolean;
}

export function ImportButton({
  config,
  className,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
}: ImportButtonProps) {
  const [open, setOpen] = useState(false);
  const hasPermission = useCan(config?.permission || '');

  if (config?.permission && !hasPermission) return null;

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4" />
        {!iconOnly && <span className="ml-1.5 hidden sm:inline">Import</span>}
      </Button>

      <ImportDialog open={open} onOpenChange={setOpen} config={config} />
    </>
  );
}
