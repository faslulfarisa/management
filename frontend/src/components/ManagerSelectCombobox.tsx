'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { Search, X, ChevronDown, User } from 'lucide-react';

interface Manager {
  id: string;
  first_name: string;
  last_name: string;
  position_name?: string;
  department_name?: string;
  branch_name?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  branchId?: string;
  activeOrgKey?: string | null;
  className?: string;
  disabled?: boolean;
  excludeId?: string;
}

export default function ManagerSelectCombobox({
  value, onChange, branchId, activeOrgKey, className = '', disabled, excludeId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevOrgKeyRef = useRef(activeOrgKey);
  const prevBranchRef = useRef(branchId);

  const fetchManagers = useCallback(async (q: string, bid?: string) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (q) params.search = q;
      if (bid) params.branch_id = bid;
      const res = await api.get('/employees/manager-select', { params });
      const all: Manager[] = res.data.data || [];
      setManagers(excludeId ? all.filter(m => m.id !== excludeId) : all);
    } catch {
      setManagers([]);
    } finally {
      setLoading(false);
    }
  }, [excludeId]);

  // Reset and refetch when active org changes.
  useEffect(() => {
    if (prevOrgKeyRef.current !== activeOrgKey) {
      prevOrgKeyRef.current = activeOrgKey;
      onChange('');
      setSelectedManager(null);
      setSearch('');
      setManagers([]);
      fetchManagers('', branchId);
    }
  }, [activeOrgKey, onChange, branchId, fetchManagers]);

  // Refetch when branch filter changes or on mount
  useEffect(() => {
    fetchManagers('', branchId);
  }, [branchId, fetchManagers]);

  // Resolve the display name for an already-selected value
  useEffect(() => {
    if (!value) { setSelectedManager(null); return; }
    const found = managers.find(m => m.id === value);
    if (found) { setSelectedManager(found); return; }
    api.get(`/employees/${value}`)
      .then(r => {
        const e = r.data.data;
        if (e) setSelectedManager({ id: e.id, first_name: e.first_name, last_name: e.last_name, position_name: e.position_name, department_name: e.department_name, branch_name: e.branch_name });
      })
      .catch(() => setSelectedManager(null));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    setOpen(o => !o);
  };

  const handleSelect = (m: Manager) => {
    onChange(m.id);
    setSelectedManager(m);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSelectedManager(null);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={[
          'w-full flex items-center justify-between border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/30',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/20',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 min-w-0">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {selectedManager ? (
            <div className="min-w-0 text-left">
              <span className="font-medium">{selectedManager.first_name} {selectedManager.last_name}</span>
              {(selectedManager.position_name || selectedManager.department_name) && (
                <span className="text-xs text-muted-foreground ml-1.5">
                  · {selectedManager.position_name || selectedManager.department_name}
                  {selectedManager.branch_name && `, ${selectedManager.branch_name}`}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Select Manager</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={e => { if (e.key === 'Enter') handleClear(e as any); }}
              className="p-0.5 rounded hover:bg-muted"
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden">


          {/* Options */}
          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : managers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground px-4">
                {'No Manager Available'}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { onChange(''); setSelectedManager(null); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 border-b border-border/50"
                >
                  — None —
                </button>
                {managers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelect(m)}
                    className={[
                      'w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors',
                      value === m.id ? 'bg-primary/10 hover:bg-primary/15' : '',
                    ].join(' ')}
                  >
                    <div className="text-sm font-medium text-foreground">
                      {m.first_name} {m.last_name}
                    </div>
                    {(m.position_name || m.department_name || m.branch_name) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[m.position_name, m.department_name, m.branch_name].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
