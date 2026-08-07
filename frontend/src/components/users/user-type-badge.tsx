'use client';

import { GitBranch } from 'lucide-react';
import { USER_TYPE_LABELS, USER_TYPE_COLORS, type UserType } from '@/lib/hierarchy';

export function UserTypeBadge({ userType }: { userType?: string | null }) {
  const type = (userType && userType in USER_TYPE_LABELS ? userType : 'employee') as UserType;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${USER_TYPE_COLORS[type]}`}>
      {USER_TYPE_LABELS[type]}
    </span>
  );
}

export interface ScopeSummary {
  type: 'branches';
  names?: string[];
}

export function ScopeCell({
  userType, scope, branch, branches
}: {
  userType?: string | null;
  scope?: ScopeSummary | null;
  branch?: string | null;
  branches?: { id: string; name: string }[] | null;
}) {
  switch (userType) {
    case 'org_admin':
      return <span className="text-sm text-muted-foreground">All branches</span>;

    case 'branch_admin':
    case 'admin': {
      const names = Array.isArray(scope?.names) ? scope.names : [];
      if (!names.length) return <span className="text-sm text-muted-foreground">No branches</span>;
      return (
        <div className="flex flex-wrap gap-1 max-w-[220px]">
          {names.map(n => (
            <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/60">
              <GitBranch className="w-3 h-3" /> {n}
            </span>
          ))}
        </div>
      );
    }

    case 'employee': {
      const displayBranch = branch || branches?.[0]?.name;
      if (displayBranch) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800/60">
            <GitBranch className="w-3 h-3" /> {displayBranch}
          </span>
        );
      }
      return <span className="text-sm text-muted-foreground">—</span>;
    }

    default:
      return <span className="text-sm text-muted-foreground">—</span>;
  }
}
