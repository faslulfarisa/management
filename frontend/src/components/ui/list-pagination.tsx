'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ListPagination({ page, limit, total, onPageChange }: { page: number; limit: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-xs text-muted-foreground">{total} total</p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
          className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
