'use client';

import { useState, useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan } from '@/hooks/use-permissions';
import { useDataExport } from '@/hooks/useDataExport';
import type { ExportConfig, ExportFormat, ExportScope, ActiveFilter } from './types';
import { ExportDialog } from './ExportDialog';

interface ExportButtonProps {
  /** Export configuration for this module. */
  config: ExportConfig;
  /** Currently active filter values (passed to the backend on server-side export). */
  filters?: Record<string, any>;
  /** Human-readable filter labels shown in the export dialog. */
  activeFilters?: ActiveFilter[];
  /** Data currently loaded on the visible page (used for client-side current-page export). */
  currentPageData?: any[];
  /** Total record count across all pages. */
  totalRecords?: number;
  /** Additional class names for the button. */
  className?: string;
  /** Button variant override. */
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  /** Button size override. */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Hide the label text, icon only. */
  iconOnly?: boolean;
}

/**
 * Drop-in export button for any table toolbar. Permission-gated: the button
 * is hidden if the user lacks the module's export permission. Opens the
 * centralized `ExportDialog` on click.
 *
 * ```tsx
 * <ExportButton
 *   config={{ module: 'employees', title: 'Employee Master', ... }}
 *   filters={{ search, status: statusFilter }}
 *   currentPageData={employees}
 *   totalRecords={meta?.total}
 * />
 * ```
 */
export function ExportButton({
  config,
  filters,
  activeFilters,
  currentPageData,
  totalRecords,
  className,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
}: ExportButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { exportData } = useDataExport();

  // Permission gate — hide if user lacks the required export permission
  const hasPermission = useCan(config.permission || '');
  // If no permission is specified, always show (module doesn't gate exports)
  const handleExport = useCallback(
    async (opts: {
      format: ExportFormat;
      scope: ExportScope;
      selectedColumns: string[];
      ignoreFilters?: boolean;
    }) => {
      await exportData({
        config,
        format: opts.format,
        scope: opts.scope,
        selectedColumns: opts.selectedColumns,
        filters: opts.ignoreFilters ? {} : filters,
        activeFilters: opts.ignoreFilters ? [] : activeFilters,
        currentPageData,
        totalRecords,
      });
    },
    [config, filters, activeFilters, currentPageData, totalRecords, exportData],
  );

  if (config.permission && !hasPermission) return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setDialogOpen(true)}
      >
        <Download className="w-4 h-4" />
        {!iconOnly && <span className="ml-1.5 hidden sm:inline">Export</span>}
      </Button>

      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={config}
        filters={filters}
        activeFilters={activeFilters}
        currentPageData={currentPageData}
        totalRecords={totalRecords}
        onExport={handleExport}
      />
    </>
  );
}
