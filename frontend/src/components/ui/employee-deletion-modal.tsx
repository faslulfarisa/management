'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
  X, Loader2, Lock, ShieldAlert, Trash2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Button } from './button';
import { useDependencyCheck } from '@/hooks/useDependencyCheck';

interface Props {
  employee: { id: string; first_name: string; last_name: string; employee_code: string };
  onClose: () => void;
  onDeleted: () => void;
}

const MODULE_ICONS: Record<string, string> = {
  attendance: '📋',
  payroll: '💰',
  payslips: '🧾',
  approvals: '✅',
  audit_logs: '🗂️',
  leave: '🌿',
  overtime: '⏱️',
  fines: '💸',
  biometric_logs: '🔍',
  shifts: '🕐',
  documents: '📄',
  notifications: '🔔',
  reportees: '👤',
};

const OPTIONAL_DELETE_MODULES = ['documents', 'notifications', 'shifts'];

export function EmployeeDeletionModal({ employee, onClose, onDeleted }: Props) {
  const depCheck = useDependencyCheck();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    depCheck.check('employee', employee.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const report = depCheck.report;
  const deps = report?.dependencies ?? [];
  const optionalDeps = deps.filter(d => OPTIONAL_DELETE_MODULES.includes(d.module));
  const retainedDeps = deps.filter(d => !OPTIONAL_DELETE_MODULES.includes(d.module));
  const recordsToDelete = optionalDeps.filter(d => selectedForDeletion.has(d.module));
  const recordsToKeep = [
    ...retainedDeps,
    ...optionalDeps.filter(d => !selectedForDeletion.has(d.module)),
  ];

  const toggleCategory = (module: string) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module); else next.add(module);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/employees/${employee.id}/permanent`, {
        data: { deleteCategories: Array.from(selectedForDeletion), confirm: 'DELETE' },
      });
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to permanently delete employee');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Permanently Delete Employee</h3>
              <p className="text-xs text-gray-500">{employee.first_name} {employee.last_name} ({employee.employee_code})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-2 max-h-[55vh] overflow-y-auto">
          {depCheck.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Analyzing linked records…</span>
            </div>
          ) : step === 1 ? (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 border border-gray-100">
                <p className="text-sm text-gray-700">
                  Review the records linked to this employee. Protected records are always retained for compliance.
                </p>
              </div>

              {retainedDeps.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Always Retained
                  </p>
                  <div className="space-y-1.5">
                    {retainedDeps.map(dep => (
                      <div key={dep.module} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm border bg-emerald-50 border-emerald-100 text-emerald-800">
                        <span className="flex items-center gap-2">
                          <span>{MODULE_ICONS[dep.module] ?? '📎'}</span>
                          <span>{dep.label}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{dep.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {optionalDeps.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Optional — choose records to delete
                  </p>
                  <div className="space-y-1.5">
                    {optionalDeps.map(dep => (
                      <label key={dep.module} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm border bg-gray-50 border-gray-100 text-gray-700 cursor-pointer hover:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedForDeletion.has(dep.module)}
                            onChange={() => toggleCategory(dep.module)}
                            className="rounded border-gray-300"
                          />
                          <span>{MODULE_ICONS[dep.module] ?? '📎'}</span>
                          <span>{dep.label}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{dep.count.toLocaleString()}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {deps.length === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    No linked records found.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Records To Keep</p>
                {recordsToKeep.length === 0 ? (
                  <p className="text-sm text-gray-500">None</p>
                ) : (
                  <div className="space-y-1.5">
                    {recordsToKeep.map(dep => (
                      <div key={dep.module} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm border bg-emerald-50 border-emerald-100 text-emerald-800">
                        <span className="flex items-center gap-2">
                          <span>{MODULE_ICONS[dep.module] ?? '📎'}</span>
                          <span>{dep.label}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{dep.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Records To Delete</p>
                {recordsToDelete.length === 0 ? (
                  <p className="text-sm text-gray-500">None</p>
                ) : (
                  <div className="space-y-1.5">
                    {recordsToDelete.map(dep => (
                      <div key={dep.module} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm border bg-red-50 border-red-100 text-red-800">
                        <span className="flex items-center gap-2">
                          <span>{MODULE_ICONS[dep.module] ?? '📎'}</span>
                          <span>{dep.label}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{dep.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  This action cannot be undone
                </p>
                <p className="text-xs text-red-600">
                  The employee record will be anonymized and permanently removed from active listings.
                </p>
              </div>

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

              {error && <div className="text-xs text-red-600 mb-4">{error}</div>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={step === 2 ? () => setStep(1) : onClose} disabled={deleting}>
            {step === 2 ? 'Back' : 'Cancel'}
          </Button>
          {step === 1 ? (
            <Button variant="destructive" onClick={() => setStep(2)} disabled={depCheck.isLoading}>
              Continue
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting || confirmText !== 'DELETE'}
              className="min-w-[160px]"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Permanently Delete
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
