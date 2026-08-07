'use client';

import { useState } from 'react';
import {
  AlertTriangle, ShieldAlert, Trash2, X,
  Archive, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Button } from './button';

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface DependencyItem {
  module: string;
  label: string;
  count: number;
  critical: boolean;
}

export interface DependencyReport {
  entityType: string;
  entityId: string;
  entityName: string;
  severity: Severity;
  canHardDelete: boolean;
  canSoftDelete: boolean;
  dependencies: DependencyItem[];
  totalLinkedRecords: number;
  blockers: string[];
}

interface Props {
  entityType: string;
  entityLabel: string;
  isLoading: boolean;
  report: DependencyReport | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onArchive?: () => void;
  isDeleting?: boolean;
}

const SEVERITY_CONFIG = {
  none: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-50',
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    label: 'No Risk',
    description: 'This record has no linked data.',
  },
  low: {
    icon: AlertCircle,
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
    label: 'Low Risk',
    description: 'Minor linked configurations exist.',
  },
  medium: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-200',
    label: 'Medium Risk',
    description: 'Contains linked operational data.',
  },
  high: {
    icon: AlertTriangle,
    iconColor: 'text-orange-500',
    iconBg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-200',
    label: 'High Risk',
    description: 'Contains active employees or operational mappings.',
  },
  critical: {
    icon: ShieldAlert,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    border: 'border-red-300',
    label: 'Critical Risk',
    description: 'Contains payroll, attendance, or payslip history.',
  },
};

const MODULE_ICONS: Record<string, string> = {
  departments:       '🏢',
  employees:         '👥',
  areas:             '📍',
  biometric_devices: '🔍',
  shifts:            '🕐',
  payroll:           '💰',
  attendance:        '📋',
  payslips:          '🧾',
  child_departments: '🏗️',
  leave:             '🌿',
  reportees:         '👤',
  approvals:         '✅',
  assignments:       '📌',
  users:             '🔑',
};

export function DeleteWarningModal({
  entityType,
  entityLabel,
  isLoading,
  report,
  onCancel,
  onConfirmDelete,
  onArchive,
  isDeleting = false,
}: Props) {
  const [confirmText, setConfirmText] = useState('');

  const severity = report?.severity ?? 'none';
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.icon;

  const needsTypedConfirm = severity === 'critical';
  const confirmReady = !needsTypedConfirm || confirmText === 'DELETE';
  const canProceed = report?.canHardDelete ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-lg bg-white rounded-2xl shadow-2xl border ${cfg.border} overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
              <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base font-semibold text-gray-900">
                  Delete {entityLabel}
                </h3>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">{cfg.description}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Analyzing dependencies…</span>
            </div>
          ) : (
            <>
              {/* Entity name */}
              {report && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100">
                  <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                    {entityLabel}
                  </span>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">
                    {report.entityName}
                  </p>
                </div>
              )}

              {/* Dependency list */}
              {report && report.dependencies.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Linked Data ({report.totalLinkedRecords.toLocaleString()} total records)
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {report.dependencies.map(dep => (
                      <div
                        key={dep.module}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border
                          ${dep.critical
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-gray-50 border-gray-100 text-gray-700'
                          }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{MODULE_ICONS[dep.module] ?? '📎'}</span>
                          <span>{dep.label}</span>
                          {dep.critical && (
                            <span className="text-[10px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">
                              CRITICAL
                            </span>
                          )}
                        </span>
                        <span className={`font-semibold tabular-nums ${dep.critical ? 'text-red-700' : 'text-gray-600'}`}>
                          {dep.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blockers */}
              {report && report.blockers.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Permanent deletion is restricted
                  </p>
                  <ul className="space-y-0.5">
                    {report.blockers.map((b, i) => (
                      <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>
                        <span>{b} — payroll/attendance history must be preserved for compliance</span>
                      </li>
                    ))}
                  </ul>
                  {onArchive && (
                    <p className="text-xs text-red-500 mt-2 font-medium">
                      Use Archive or Deactivate instead to preserve data integrity.
                    </p>
                  )}
                </div>
              )}

              {/* No dependencies */}
              {report && report.dependencies.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    No linked records found. Safe to delete.
                  </p>
                </div>
              )}

              {/* Typed confirmation for critical */}
              {needsTypedConfirm && canProceed && (
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm this action
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-300 bg-red-50 placeholder:text-red-300"
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
              Cancel
            </Button>
            {onArchive && (
              <Button
                variant="outline"
                onClick={onArchive}
                disabled={isDeleting}
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
              >
                <Archive className="w-4 h-4 mr-1.5" />
                Archive Instead
              </Button>
            )}
          </div>
          <Button
            variant="destructive"
            onClick={onConfirmDelete}
            disabled={isLoading || isDeleting || !confirmReady || (!canProceed && !onArchive)}
            className="min-w-[120px]"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-1.5" />
                {canProceed ? 'Delete' : 'Cannot Delete'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
