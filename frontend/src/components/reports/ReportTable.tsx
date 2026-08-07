'use client';

import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Loader2, BarChart2, ChevronLeft, ChevronRight, AlignJustify, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export interface ReportTableProps<T extends object> {
  columns: ColumnDef<T, any>[];
  data: T[];
  total: number;
  page: number;
  pageSize?: number;
  onPageChange: (p: number) => void;
  loading?: boolean;
  stickyFirstCol?: boolean;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Server-side sort: when provided, header clicks call this instead of sorting the current page client-side. */
  onSortChange?: (sort: SortingState) => void;
  sorting?: SortingState;
}

export function ReportTable<T extends object>({
  columns,
  data,
  total,
  page,
  pageSize = 50,
  onPageChange,
  loading,
  stickyFirstCol,
  onRowClick,
  emptyMessage = 'No data for the selected filters',
  onSortChange,
  sorting: controlledSorting,
}: ReportTableProps<T>) {
  const [compact, setCompact] = useState(false);
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const totalPages = Math.ceil(total / pageSize);
  const manualSorting = !!onSortChange;
  const sorting = controlledSorting ?? localSorting;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualPagination: true,
    manualSorting,
    pageCount: totalPages,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (onSortChange) onSortChange(next);
      else setLocalSorting(next);
    },
  });

  const cellCls = compact ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BarChart2 className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="flex justify-end items-center px-4 py-2 border-b border-border/50">
            <button
              onClick={() => setCompact(c => !c)}
              title={compact ? 'Switch to comfortable density' : 'Switch to compact density'}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{compact ? 'Comfortable' : 'Compact'}</span>
            </button>
          </div>

          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(hg => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header, colIdx) => {
                    const sortable = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        pinned={stickyFirstCol && colIdx === 0}
                        onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                        className={cn(
                          cellCls,
                          sortable && 'cursor-pointer select-none hover:text-foreground',
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sortable && (
                              sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" />
                                : sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />
                            )}
                          </span>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row, rowIdx) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    rowIdx % 2 !== 0 && 'bg-muted/[0.02]',
                  )}
                >
                  {row.getVisibleCells().map((cell, colIdx) => (
                    <TableCell
                      key={cell.id}
                      pinned={stickyFirstCol && colIdx === 0}
                      className={cn(cellCls, 'text-foreground')}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border gap-2">
            <p className="text-xs text-muted-foreground tabular-nums hidden sm:block">
              {total.toLocaleString('en-IN')} record{total !== 1 ? 's' : ''}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 mx-auto sm:mx-0 sm:ml-auto">
                {/* First page — hidden on mobile */}
                <button
                  onClick={() => onPageChange(1)}
                  disabled={page === 1}
                  className="hidden sm:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  title="First page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="text-xs text-muted-foreground px-2 tabular-nums min-w-[5rem] text-center">
                  <span className="hidden sm:inline">Page </span>
                  {page} / {totalPages}
                </span>

                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Last page — hidden on mobile */}
                <button
                  onClick={() => onPageChange(totalPages)}
                  disabled={page === totalPages}
                  className="hidden sm:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  title="Last page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Mobile: show record count next to pagination */}
            <p className="text-xs text-muted-foreground tabular-nums sm:hidden ml-auto">
              {total.toLocaleString('en-IN')} rows
            </p>
          </div>
        </>
      )}
    </div>
  );
}
