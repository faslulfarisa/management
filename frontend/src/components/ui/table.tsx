import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Centralized table primitives for the whole app.
 *
 * `TableHeader` is sticky by default (`sticky top-0`) with a solid,
 * non-transparent background so column headers stay visible while a table's
 * rows scroll past underneath.
 *
 * `position: sticky` only reacts to its *own* nearest scroll container's
 * internal scroll offset — it does NOT fall back to page-level scrolling
 * just because an ancestor's computed `overflow` happens to be non-`visible`.
 * A plain `overflow-x-auto` div with auto height never develops real internal
 * scroll (scrollHeight === clientHeight), so a sticky header inside it would
 * never actually stick while the surrounding page scrolls. To make the
 * sticky header work regardless of where the table sits on the page, `Table`
 * gives its scroll container a bounded height (`max-h-[70vh]`) so it scrolls
 * internally — short tables are unaffected since the cap only kicks in once
 * content actually exceeds it.
 */

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
  /** Ref to the scroll container div, for callers that need to measure/observe scroll (e.g. a "scroll for more" affordance). */
  containerRef?: React.Ref<HTMLDivElement>;
  onContainerScroll?: React.UIEventHandler<HTMLDivElement>;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, containerRef, onContainerScroll, ...props }, ref) => (
    <div
      ref={containerRef}
      onScroll={onContainerScroll}
      className={cn('w-full max-h-[70vh] overflow-auto', containerClassName)}
    >
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        'sticky top-0 z-20 bg-card shadow-[0_1px_2px_-1px_rgb(0_0_0_/_0.08)] [&_tr]:border-b [&_tr]:border-border',
        className,
      )}
      {...props}
    />
  ),
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('sticky bottom-0 z-20 bg-muted/60 border-t border-border font-medium', className)}
      {...props}
    />
  ),
);
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Pin this header cell to the left edge while the table scrolls horizontally. */
  pinned?: boolean;
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, pinned, ...props }, ref) => (
    <th
      ref={ref}
      scope="col"
      className={cn(
        'h-10 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap',
        pinned && 'sticky left-0 z-30 bg-card border-r border-border/40',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Pin this cell to the left edge while the table scrolls horizontally. */
  pinned?: boolean;
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, pinned, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'px-4 py-3 align-middle whitespace-nowrap',
        pinned && 'sticky left-0 z-10 bg-card border-r border-border/40',
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  ),
);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption };
