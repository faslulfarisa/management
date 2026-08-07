'use client';

import { Inbox } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataSectionProps<T> {
  title: string;
  rows: T[];
  columns: Column<T>[];
  emptyMessage?: string;
  rowKey: (row: T) => string;
}

/** Renders one labeled sub-category (e.g. "Late Arrivals") as a small table, or an empty-state row when there's no data. */
export function DataSection<T>({ title, rows, columns, emptyMessage = 'Nothing to show', rowKey }: DataSectionProps<T>) {
  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Inbox className="w-6 h-6 mb-1.5 opacity-30" />
          <p className="text-xs">{emptyMessage}</p>
        </div>
      ) : (
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className ?? ''}>{c.render(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
