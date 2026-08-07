'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { FileText, Download, FolderOpen } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import type { EmployeeDocument } from '@/types/employee';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
  payslip:        { label: 'Payslip',      color: 'text-primary',     bg: 'bg-primary/10'    },
  contract:       { label: 'Contract',     color: 'text-purple-600',  bg: 'bg-purple-100'    },
  hr_letter:      { label: 'HR Letter',    color: 'text-blue-600',    bg: 'bg-blue-100'      },
  warning_letter: { label: 'Warning',      color: 'text-red-600',     bg: 'bg-red-100'       },
  offer_letter:   { label: 'Offer Letter', color: 'text-emerald-600', bg: 'bg-emerald-100'   },
  other:          { label: 'Document',     color: 'text-gray-500',    bg: 'bg-gray-100'      },
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortalDocuments() {
  const { data: docs, isLoading } = useQuery({
    queryKey: ['employee-documents'],
    queryFn: () => employeeApi.getDocuments(),
    staleTime: 10 * 60_000,
  });

  const handleDownload = (doc: EmployeeDocument) => {
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const grouped = (docs ?? []).reduce<Record<string, EmployeeDocument[]>>((acc, d) => {
    const key = d.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <div>
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Documents</h1>
      </div>

      <div className="p-6 max-w-[900px]">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-1/4 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !docs?.length ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
            <FolderOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No documents available</p>
            <p className="text-xs text-gray-400 mt-1">Your HR documents will appear here once uploaded</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-5 px-5 py-2 bg-gray-50 border-b border-gray-100">
              {['Document', 'Type', 'Size', 'Added', ''].map((col) => (
                <p key={col} className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{col}</p>
              ))}
            </div>

            <div className="divide-y divide-gray-50">
              {docs.map((doc) => {
                const cfg = typeConfig[doc.type] ?? typeConfig.other;
                return (
                  <div key={doc.id} className="grid grid-cols-5 items-center px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
                        <FileText className={cn('h-4 w-4', cfg.color)} />
                      </div>
                      <p className="text-[13px] font-medium text-gray-800 truncate">{doc.name}</p>
                    </div>
                    <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full w-fit', `${cfg.bg} ${cfg.color}`)}>
                      {cfg.label}
                    </span>
                    <p className="text-[12px] text-gray-400">{formatBytes(doc.file_size) || '—'}</p>
                    <p className="text-[12px] text-gray-400">
                      {formatDistanceToNow(parseISO(doc.created_at), { addSuffix: true })}
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
