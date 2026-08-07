const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-red-100 text-red-800',
  renewal_pending: 'bg-orange-100 text-orange-800',
  archived: 'bg-slate-100 text-slate-600',
  deleted: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  renewal_pending: 'Renewal Pending',
  archived: 'Archived',
  deleted: 'Deleted',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const CONFIDENTIALITY_COLORS: Record<string, string> = {
  public: 'bg-sky-50 text-sky-700 border-sky-200',
  internal: 'bg-gray-50 text-gray-600 border-gray-200',
  confidential: 'bg-amber-50 text-amber-700 border-amber-200',
  restricted: 'bg-red-50 text-red-700 border-red-200',
};

export function ConfidentialityBadge({ level }: { level: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${CONFIDENTIALITY_COLORS[level] || CONFIDENTIALITY_COLORS.internal}`}>
      {level}
    </span>
  );
}

export function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return <span className="text-xs text-muted-foreground">—</span>;
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  let color = 'text-muted-foreground';
  let label = new Date(expiryDate).toLocaleDateString('en-IN');
  if (days < 0) { color = 'text-red-600 font-medium'; label = `Expired ${Math.abs(days)}d ago`; }
  else if (days <= 7) { color = 'text-red-600 font-medium'; label = `${label} (${days}d)`; }
  else if (days <= 30) { color = 'text-amber-600 font-medium'; label = `${label} (${days}d)`; }
  else if (days <= 90) { color = 'text-amber-500'; label = `${label} (${days}d)`; }
  return <span className={`text-xs ${color}`}>{label}</span>;
}
