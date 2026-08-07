'use client';

import { useState } from 'react';
import { ShieldQuestion, FileEdit } from 'lucide-react';
import { OrganizationApprovalsPanel } from '@/components/operations/organization-approvals-panel';
import { OrganizationChangeRequestsPanel } from '@/components/operations/organization-change-requests-panel';

type SubTab = 'approvals' | 'changes';

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'approvals', label: 'Organization Approvals', icon: ShieldQuestion },
  { key: 'changes',   label: 'Change Requests',         icon: FileEdit },
];

export default function OrganizationRequestsPage() {
  const [subTab, setSubTab] = useState<SubTab>('approvals');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization Requests</h1>
        <p className="text-muted-foreground">Review self-registered organizations and company-profile change requests</p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              subTab === key
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'approvals' && <OrganizationApprovalsPanel />}
      {subTab === 'changes' && <OrganizationChangeRequestsPanel />}
    </div>
  );
}
