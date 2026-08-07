'use client';

import { ApprovalInbox } from '@/components/approvals/approval-inbox';

/** Action Required tab — reuses the existing approval inbox (approve/reject hit /approvals/:id/...). */
export function ActionRequiredTab() {
  return <ApprovalInbox mode="inbox" />;
}
