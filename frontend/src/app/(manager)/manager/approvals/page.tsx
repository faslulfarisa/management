'use client';

import { useState } from 'react';
import { useApprovalsSocket } from '@/hooks/use-approvals-socket';
import { ApprovalInbox } from '@/components/approvals/approval-inbox';
import { CheckSquare, Inbox, Send } from 'lucide-react';

type Tab = 'pending' | 'submitted';

export default function ManagerApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending');

  // Connect WebSockets for real-time approvals updates
  useApprovalsSocket();

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'pending',   label: 'Inbox Feed',     icon: Inbox },
    { key: 'submitted', label: 'Past Actions',   icon: Send },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 shadow-md">
          <CheckSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Team Approvals</h1>
          <p className="text-xs text-slate-400 mt-0.5">Review and manage pending workflows, timesheets, and leave cards</p>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === key
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Inbox Panel */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        {tab === 'pending' ? (
          <ApprovalInbox mode="inbox" />
        ) : (
          <ApprovalInbox mode="submitted" />
        )}
      </div>
    </div>
  );
}
