'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { FileText, Download, FolderOpen } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import type { EmployeeDocument } from '@/types/employee';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalDocuments } from '@/components/employee/desktop/portal-documents';
// ── Mobile imports (original) ──────────────────────────────────
import { MobileHeader } from '@/components/employee/layout/mobile-header';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { SkeletonCard } from '@/components/employee/shared/skeleton-card';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
  payslip:        { label: 'Payslip',      color: 'text-primary',     bg: 'bg-primary/10'    },
  contract:       { label: 'Contract',     color: 'text-purple-600',  bg: 'bg-purple-100'    },
  hr_letter:      { label: 'HR Letter',    color: 'text-blue-600',    bg: 'bg-blue-100'      },
  warning_letter: { label: 'Warning',      color: 'text-red-600',     bg: 'bg-red-100'       },
  offer_letter:   { label: 'Offer Letter', color: 'text-emerald-600', bg: 'bg-emerald-100'   },
  other:          { label: 'Document',     color: 'text-slate-600',   bg: 'bg-slate-100'     },
};

export default function DocumentsPage() {
  return (
    <EmployeeGuard>
      {/* ── Mobile (unchanged original) ─────────────────────── */}
      <div className="md:hidden">
        <MobileDocumentsContent />
      </div>

      {/* ── Desktop (new professional portal) ───────────────── */}
      <div className="hidden md:block">
        <PortalDocuments />
      </div>
    </EmployeeGuard>
  );
}

function formatBytes(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MobileDocumentsContent() {
  const { data: docs, isLoading } = useQuery({
    queryKey: ['employee-documents'],
    queryFn: () => employeeApi.getDocuments(),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="flex flex-col">
      <MobileHeader title="My Documents" />

      <div className="px-4 pt-4 pb-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : docs?.length ? (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {docs.map((doc) => <DocumentRow key={doc.id} doc={doc} />)}
          </div>
        ) : (
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" />}
            title="No documents"
            subtitle="Your HR documents and payslips will appear here."
            className="mt-12"
          />
        )}
      </div>
    </div>
  );
}

function DocumentRow({ doc }: { doc: EmployeeDocument }) {
  const cfg = typeConfig[doc.type] ?? typeConfig.other;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
        <FileText className={cn('h-5 w-5', cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
        <p className="text-xs text-muted-foreground">
          <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
          {doc.file_size && ` · ${formatBytes(doc.file_size) ?? ''}`}
          {` · ${formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}`}
        </p>
      </div>
      <button
        onClick={handleDownload}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg hover:bg-muted transition-colors"
        aria-label="Download"
      >
        <Download className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
