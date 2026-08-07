'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, UserPlus, Eye, EyeOff,
  ChevronDown, Check, Search, ArrowLeft, ArrowRight,
  Users, Building2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { USER_TYPE_LABELS, type UserType } from '@/lib/hierarchy';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role       { id: string; name: string; is_system?: boolean; }
interface Department { id: string; name: string; }
interface Branch     { id: string; name: string; }

/** Unified entry returned by GET /users/directory */
interface DirectoryEntry {
  id: string;
  source: 'user' | 'employee';
  email?: string;
  phone?: string;
  first_name: string;
  last_name: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  is_active: boolean;
}

/** Platform-only user for "Reports To" selector */
interface OrgUser {
  id: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  department?: string;
  role?: string;
  is_active: boolean;
}

export interface CreateUserDrawerProps {
  onClose: () => void;
  onSaved: () => void;
  /** When set, the drawer opens directly in "Edit Access" mode for this user. */
  editUser?: { id: string; name: string; email?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100   text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100  text-amber-700',
  'bg-rose-100   text-rose-700',
  'bg-cyan-100   text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function displayName(entry: Pick<DirectoryEntry, 'first_name' | 'last_name' | 'email'>) {
  const n = `${entry.first_name ?? ''} ${entry.last_name ?? ''}`.trim();
  return n || entry.email?.split('@')[0] || 'Unknown';
}

function AvatarInitials({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const sz = size === 'md' ? 'w-9 h-9 text-sm' : 'w-7 h-7 text-xs';
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${sz} ${avatarColor(name || '?')}`}>
      {initials || '?'}
    </span>
  );
}

function SourceBadge({ source }: { source: 'user' | 'employee' }) {
  return source === 'user' ? (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold uppercase tracking-wide shrink-0">
      <Users className="w-2.5 h-2.5" /> Staff
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 font-bold uppercase tracking-wide shrink-0">
      <Building2 className="w-2.5 h-2.5" /> Employee
    </span>
  );
}

// ─── Password Input ───────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, error }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10 bg-background transition-colors ${
            error ? 'border-red-400' : 'border-border'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Dropdown Positioning (flips upward when there's no room below) ──────────

interface DropdownPos { top?: number; bottom?: number; left: number; width: number; maxHeight: number; }

function useDropdownPosition(open: boolean, btnRef: React.RefObject<HTMLElement | null>): DropdownPos | null {
  const [pos, setPos] = useState<DropdownPos | null>(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const el = btnRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const minPanelHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openUpward = spaceBelow < minPanelHeight && spaceAbove > spaceBelow;
      setPos({
        left: rect.left,
        width: rect.width,
        top: openUpward ? undefined : rect.bottom + 4,
        bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
        maxHeight: Math.max(160, (openUpward ? spaceAbove : spaceBelow) - 4),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, btnRef]);

  return pos;
}

// ─── Generic Searchable Select (portal) ──────────────────────────────────────

interface SelectOption { value: string; label: string; sublabel?: string; }

function SearchableSelect({
  options, value, onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  error, disabled,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const btnRef            = useRef<HTMLButtonElement>(null);
  const panelRef          = useRef<HTMLDivElement>(null);
  const pos               = useDropdownPosition(open, btnRef);
  const selected          = options.find(o => o.value === value);
  const filtered          = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sublabel?.toLowerCase().includes(query.toLowerCase()) ?? false),
  );

  const handleToggle = () => {
    if (disabled) return;
    setOpen(v => !v);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          error ? 'border-red-400' : 'border-border hover:border-primary/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-background"
              />
            </div>
          </div>
          <div className="overflow-y-auto py-1 flex-1 min-h-0">
            {filtered.length === 0
              ? <p className="text-xs text-muted-foreground px-3 py-2.5 text-center">No results found</p>
              : filtered.map(o => (
                <button
                  key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/60 text-left gap-2"
                >
                  <div>
                    <p className="font-medium text-foreground">{o.label}</p>
                    {o.sublabel && <p className="text-xs text-muted-foreground">{o.sublabel}</p>}
                  </div>
                  {value === o.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))
            }
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Multi Select (checkbox list, portal) ─────────────────────────────────────

function MultiSelect({
  options, values, onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  error,
}: {
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const btnRef            = useRef<HTMLButtonElement>(null);
  const panelRef          = useRef<HTMLDivElement>(null);
  const pos               = useDropdownPosition(open, btnRef);
  const filtered          = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const selectedLabels    = options.filter(o => values.includes(o.value)).map(o => o.label);

  const toggleValue = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  const handleToggle = () => {
    setOpen(v => !v);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer ${
          error ? 'border-red-400' : 'border-border hover:border-primary/50'
        }`}
      >
        <span className={`truncate text-left ${selectedLabels.length ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabels.length ? selectedLabels.join(', ') : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-background"
              />
            </div>
          </div>
          <div className="overflow-y-auto py-1 flex-1 min-h-0">
            {filtered.length === 0
              ? <p className="text-xs text-muted-foreground px-3 py-2.5 text-center">No results found</p>
              : filtered.map(o => {
                const checked = values.includes(o.value);
                return (
                  <button
                    key={o.value} type="button"
                    onClick={() => toggleValue(o.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 text-left"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    <span className="font-medium text-foreground">{o.label}</span>
                  </button>
                );
              })
            }
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Reports-To User Select (org users only, preloaded) ───────────────────────

function UserSearchSelect({
  users, value, onChange, placeholder = 'Search users…', excludeIds = [],
}: {
  users: OrgUser[];
  value: string;
  onChange: (user: OrgUser | null) => void;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const btnRef            = useRef<HTMLButtonElement>(null);
  const panelRef          = useRef<HTMLDivElement>(null);
  const pos               = useDropdownPosition(open, btnRef);
  const selected          = users.find(u => u.id === value);

  const filtered = users
    .filter(u => !excludeIds.includes(u.id))
    .filter(u => {
      const q = query.toLowerCase();
      return (
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone?.includes(q) ?? false)
      );
    });

  const handleToggle = () => {
    setOpen(v => !v); setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef} type="button" onClick={handleToggle}
        className="w-full flex items-center gap-3 border border-border rounded-xl px-3 py-2.5 text-sm hover:border-primary/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background transition-colors"
      >
        {selected ? (
          <>
            <AvatarInitials name={`${selected.first_name} ${selected.last_name}`} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground">{selected.first_name} {selected.last_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {selected.email}{selected.department ? ` · ${selected.department}` : ''}
              </p>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground flex-1 text-left">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, email or phone…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-background"
              />
            </div>
          </div>
          <div className="overflow-y-auto py-1 flex-1 min-h-0">
            {filtered.length === 0
              ? <p className="text-xs text-muted-foreground px-3 py-3 text-center">No users found</p>
              : filtered.map(u => (
                <button key={u.id} type="button" onClick={() => { onChange(u); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 text-left"
                >
                  <AvatarInitials name={`${u.first_name} ${u.last_name}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">{u.first_name} {u.last_name}</p>
                      {u.role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold shrink-0 uppercase tracking-wide">
                          {u.role}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    {u.department && <p className="text-xs text-muted-foreground">{u.department}</p>}
                  </div>
                  {value === u.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))
            }
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Directory Search Select (live API, all sources) ─────────────────────────

function DirectorySearchSelect({
  value,
  onChange,
}: {
  value: DirectoryEntry | null;
  onChange: (entry: DirectoryEntry | null) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const btnRef                = useRef<HTMLButtonElement>(null);
  const panelRef              = useRef<HTMLDivElement>(null);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pos                   = useDropdownPosition(open, btnRef);

  const fetchDir = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await api.get('/users/directory', { params: q ? { q } : {} });
      setResults(res.data.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce query changes while panel is open
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDir(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, fetchDir]);

  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setQuery('');
    fetchDir(''); // initial load
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const name = value ? displayName(value) : '';

  return (
    <div>
      <button
        ref={btnRef} type="button" onClick={handleOpen}
        className="w-full flex items-center gap-3 border border-border rounded-xl px-3 py-2.5 text-sm hover:border-primary/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background transition-colors"
      >
        {value ? (
          <>
            <AvatarInitials name={name} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {value.email || value.phone || '—'}
                {value.employee_code ? ` · ${value.employee_code}` : ''}
              </p>
            </div>
            <SourceBadge source={value.source} />
          </>
        ) : (
          <span className="text-muted-foreground flex-1 text-left">
            Search users, employees, or employee code…
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ml-1 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999 }}
          className="bg-background border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
        >
          {/* Live search input */}
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, email, phone, or employee code…"
                className="w-full pl-8 pr-8 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 bg-background"
              />
              {loading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Section header row */}
          {!loading && results.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border/50 bg-muted/20 shrink-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {results.length} result{results.length !== 1 ? 's' : ''} across all sources
              </span>
            </div>
          )}

          {/* Results list */}
          <div className="overflow-y-auto py-1 flex-1 min-h-0">
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Searching all sources…</span>
              </div>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                No users or employees found
              </p>
            ) : (
              results.map(entry => {
                const eName = displayName(entry);
                const isSelected = value?.id === entry.id && value?.source === entry.source;
                return (
                  <button
                    key={`${entry.source}-${entry.id}`}
                    type="button"
                    onClick={() => { onChange(entry); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
                  >
                    <AvatarInitials name={eName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{eName}</p>
                        <SourceBadge source={entry.source} />
                        {entry.employee_code && (
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {entry.employee_code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.email || entry.phone || '—'}
                      </p>
                      {(entry.designation || entry.department) && (
                        <p className="text-xs text-muted-foreground">
                          {[entry.designation, entry.department].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Section / Field helpers ──────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 mt-1">
      {children}
    </p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ─── Hierarchy & Scope Fields ──────────────────────────────────────────────────

interface HierarchyOption { id: string; name: string; }

function AccessScopeFields({
  manageableTypes, branches,
  userType, onUserTypeChange,
  branchIds, onBranchIdsChange,
  organizations, orgId, onOrgIdChange,
  errors,
}: {
  manageableTypes: UserType[];
  branches: HierarchyOption[];
  userType: UserType;
  onUserTypeChange: (t: UserType) => void;
  branchIds: string[];
  onBranchIdsChange: (ids: string[]) => void;
  organizations: HierarchyOption[];
  orgId: string;
  onOrgIdChange: (id: string) => void;
  errors?: Record<string, string>;
}) {
  const actualTypes = manageableTypes.length > 0
    ? manageableTypes
    : (['employee', 'admin', 'branch_admin', 'org_admin'] as UserType[]);
  const typeOptions: SelectOption[] = actualTypes.map(t => ({
    value: t,
    label: USER_TYPE_LABELS[t],
    sublabel: t === 'admin'
      ? 'Handles one branch only.'
      : t === 'branch_admin'
        ? 'Can handle one or more assigned branches.'
        : undefined,
  }));
  const branchOptions: SelectOption[] = branches.map(b => ({ value: b.id, label: b.name }));
  const orgOptions: SelectOption[] = organizations.map(o => ({ value: o.id, label: o.name }));

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>User Type</FieldLabel>
        <SearchableSelect options={typeOptions} value={userType}
          onChange={v => onUserTypeChange(v as UserType)} placeholder="Select user type" />
        <p className="text-xs text-muted-foreground mt-1.5">
          Defines hierarchy & scope — kept separate from the role/position above.
        </p>
      </div>

      {userType === 'org_admin' && (
        <div>
          <FieldLabel required>Organization</FieldLabel>
          <SearchableSelect options={orgOptions} value={orgId}
            onChange={onOrgIdChange} placeholder="Select organization"
            searchPlaceholder="Search organizations…" error={!!errors?.orgId} />
          {errors?.orgId && <p className="text-xs text-red-500 mt-1">{errors.orgId}</p>}
          <p className="text-xs text-muted-foreground mt-1.5">
            Full Organization Admin access to all branches in the selected organization.
          </p>
        </div>
      )}

      {userType === 'branch_admin' && (
        <div>
          <FieldLabel required>Branches</FieldLabel>
          <MultiSelect options={branchOptions} values={branchIds} onChange={onBranchIdsChange}
            placeholder="Select branches" searchPlaceholder="Search branches…"
            error={!!errors?.branchIds} />
          {errors?.branchIds && <p className="text-xs text-red-500 mt-1">{errors.branchIds}</p>}
        </div>
      )}

      {userType === 'admin' && (
        <div>
          <FieldLabel required>Branch</FieldLabel>
          <SearchableSelect options={branchOptions} value={branchIds[0] ?? ''}
            onChange={v => onBranchIdsChange(v ? [v] : [])} placeholder="Select branch"
            error={!!errors?.branchIds} />
          {errors?.branchIds && <p className="text-xs text-red-500 mt-1">{errors.branchIds}</p>}
          <p className="text-xs text-muted-foreground mt-1.5">
            Admin access is limited to this single branch.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1 as const, label: 'Select' },
  { n: 2 as const, label: 'Verify' },
  { n: 3 as const, label: 'Assign' },
];

function StepIndicator({ step, skipVerify }: { step: 1 | 2 | 3; skipVerify: boolean }) {
  const steps = skipVerify
    ? [{ n: 1 as const, label: 'Select' }, { n: 3 as const, label: 'Assign' }]
    : STEPS;

  const displayStep = skipVerify && step === 3 ? 2 : step;

  return (
    <div className="flex items-center px-6 py-3.5 bg-muted/30 border-b border-border shrink-0">
      {steps.map((s, i) => {
        const pos = i + 1;
        return (
          <div key={s.n} className="flex items-center flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                displayStep > pos
                  ? 'bg-primary text-primary-foreground'
                  : displayStep === pos
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {displayStep > pos ? <Check className="w-3 h-3" /> : pos}
              </div>
              <span className={`text-xs font-medium transition-colors hidden sm:block ${
                displayStep >= pos ? 'text-foreground' : 'text-muted-foreground'
              }`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 mx-2 transition-colors ${displayStep > pos ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function CreateUserDrawer({ onClose, onSaved, editUser }: CreateUserDrawerProps) {
  const [mode, setMode] = useState<'create' | 'invite'>('create');
  const { selectedTenantId } = useAuthStore();

  // Shared reference data
  const [roles,       setRoles]       = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches,    setBranches]    = useState<Branch[]>([]);
  const [positions,   setPositions]   = useState<{ id: string; name: string }[]>([]);
  const [orgUsers,    setOrgUsers]    = useState<OrgUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Hierarchy & scope (user_type) reference data
  const [manageableTypes,   setManageableTypes]   = useState<UserType[]>([]);
  const [hierarchyBranches, setHierarchyBranches] = useState<HierarchyOption[]>([]);
  const [organizations,     setOrganizations]     = useState<HierarchyOption[]>([]);

  // Hierarchy & scope selection — shared by Method 1 and Method 2 (Step 3)
  const [accessUserType, setAccessUserType] = useState<UserType>('employee');
  const [accessBranchIds, setAccessBranchIds] = useState<string[]>([]);
  const [accessOrgId, setAccessOrgId] = useState('');

  // Default the Organization picker (org_admin scope) to the admin's currently active org
  useEffect(() => {
    if (selectedTenantId && !accessOrgId) setAccessOrgId(selectedTenantId);
  }, [selectedTenantId, accessOrgId]);

  // Method 1 — Create New User
  const [form1, setForm1] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    password: '', confirm_password: '',
    department_id: '', role_id: '', branch_ids: [] as string[], position_id: '',
    status: 'active' as 'active' | 'inactive',
    reports_to: '',
  });
  const [errors1, setErrors1] = useState<Record<string, string>>({});
  const [saving1, setSaving1] = useState(false);

  // Method 2 — Invite Existing (directory)
  const [step,           setStep]           = useState<1 | 2 | 3>(1);
  const [selectedEntry,  setSelectedEntry]  = useState<DirectoryEntry | null>(null);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyError,    setVerifyError]    = useState('');
  const [verifying,      setVerifying]      = useState(false);
  const [form2, setForm2] = useState({
    department_id: '', role_id: '', branch_ids: [] as string[], position_id: '', reports_to: '',
    username: '', password: '', confirm_password: '',
  });
  const [errors2, setErrors2] = useState<Record<string, string>>({});
  const [saving2, setSaving2] = useState(false);

  // Edit Access mode (existing user)
  const [editLoading,    setEditLoading]    = useState(!!editUser);
  const [editSaving,     setEditSaving]     = useState(false);
  const [editPositionId, setEditPositionId] = useState('');
  const [editError,      setEditError]      = useState('');

  // employee source skips the password-verify step
  const skipVerify = selectedEntry?.source === 'employee';

  // Load reference data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [rolesRes, usersRes] = await Promise.all([
          api.get('/roles'),
          api.get('/users', { params: { page: 1, limit: 500 } }),
        ]);
        setRoles(rolesRes.data.data ?? []);
        setOrgUsers(usersRes.data.data ?? []);
        try { const r = await api.get('/departments'); setDepartments(r.data.data ?? []); } catch {}
        try { const r = await api.get('/branches');    setBranches(r.data.data ?? []);    } catch {}
        try { const r = await api.get('/positions');   setPositions(r.data.data ?? []);   } catch {}
        try {
          const r = await api.get('/users/hierarchy/manageable-types');
          setManageableTypes(r.data.data?.types ?? []);
          setHierarchyBranches(r.data.data?.branches ?? []);
        } catch {}
        try {
          const r = await api.get('/organizations');
          setOrganizations((r.data.data ?? []).map((t: any) => ({ id: t.id, name: t.name })));
        } catch {}
      } catch (err) { console.error('Failed to load form data:', err); }
      finally { setDataLoading(false); }
    };
    load();
  }, []);

  // Method 1 only — when assigning Org Admin for an organization other than the admin's
  // active one, the new user must be created there too, so Branch/Position/Reports-To
  // reference data needs to come from that target org instead of the active one.
  const crossOrgTargetId =
    mode === 'create' && accessUserType === 'org_admin' && accessOrgId && accessOrgId !== selectedTenantId
      ? accessOrgId
      : undefined;
  const loadedRefOrgRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (dataLoading) return;
    if (loadedRefOrgRef.current === crossOrgTargetId) return;
    loadedRefOrgRef.current = crossOrgTargetId;
    (async () => {
      try {
        const params = crossOrgTargetId ? { organizationId: crossOrgTargetId } : {};
        const [branchesRes, positionsRes, usersRes] = await Promise.all([
          api.get('/branches', { params }),
          api.get('/positions', { params }),
          api.get('/users', { params: { ...params, page: 1, limit: 500 } }),
        ]);
        setBranches(branchesRes.data.data ?? []);
        setPositions(positionsRes.data.data ?? []);
        setOrgUsers(usersRes.data.data ?? []);
      } catch {}
    })();
    setForm1(f => ({ ...f, branch_ids: [], position_id: '', reports_to: '' }));
  }, [crossOrgTargetId, dataLoading]);

  // Edit Access mode — prefill from the target user's current access
  useEffect(() => {
    if (!editUser) return;
    (async () => {
      try {
        const res = await api.get(`/users/${editUser.id}/access`);
        const access = res.data?.data;
        if (access) {
          setAccessUserType(access.userType ?? 'employee');
          setAccessBranchIds(access.branchIds ?? []);
          setEditPositionId(access.positionId ?? '');
        }
      } catch (err: any) {
        setEditError(err.response?.data?.error ?? 'Failed to load user access');
      } finally {
        setEditLoading(false);
      }
    })();
  }, [editUser]);

  useEffect(() => {
    if (accessUserType === 'org_admin') {
      const allBranchIds = branches.map(b => b.id);
      setForm1(f => ({ ...f, branch_ids: allBranchIds }));
      setForm2(f => ({ ...f, branch_ids: allBranchIds }));
      setAccessBranchIds(allBranchIds);
    } else {
      setForm1(f => ({ ...f, branch_ids: [] }));
      setForm2(f => ({ ...f, branch_ids: [] }));
      setAccessBranchIds([]);
    }
  }, [accessUserType, branches]);

  // ── Hierarchy & Scope (shared) ──────────────────────────────────────────────

  const validateAccessScope = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (accessUserType === 'branch_admin' && accessBranchIds.length === 0) {
      e.branchIds = 'Select at least one branch';
    }
    if (accessUserType === 'admin' && accessBranchIds.length !== 1) {
      e.branchIds = 'Select exactly one branch';
    }
    if (accessUserType === 'org_admin' && !accessOrgId) {
      e.orgId = 'Select an organization';
    }
    return e;
  };

  const applyAccessScope = async (targetUserId: string, positionId: string) => {
    if (manageableTypes.length === 0) return;
    await api.patch(`/users/${targetUserId}/access`, {
      userType: accessUserType,
      branchIds: (accessUserType === 'branch_admin' || accessUserType === 'admin') ? accessBranchIds : undefined,
      positionId: positionId || null,
      ...(accessUserType === 'org_admin' && accessOrgId ? { organizationId: accessOrgId } : {}),
    });
  };

  // ── Method 1 ──────────────────────────────────────────────────────────────

  const validate1 = () => {
    const e: Record<string, string> = {};
    if (!form1.first_name.trim())  e.first_name = 'Required';
    if (!form1.last_name.trim())   e.last_name  = 'Required';
    if (!form1.email.trim())       e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form1.email)) e.email = 'Enter a valid email address';
    if (!form1.password)                e.password = 'Password is required';
    else if (form1.password.length < 8) e.password = 'Minimum 8 characters';
    if (form1.password !== form1.confirm_password) e.confirm_password = 'Passwords do not match';
    if (branchLocationRequired && form1.branch_ids.length === 0) e.branch_ids = 'Please select at least one branch';
    Object.assign(e, validateAccessScope());
    setErrors1(e);
    return Object.keys(e).length === 0;
  };

  const submit1 = async () => {
    if (!validate1()) return;
    setSaving1(true);
    try {
      const { confirm_password, branch_ids, ...payload } = form1;
      
      let payloadBranchIds: string[] = [];
      if (accessUserType === 'employee') {
        payloadBranchIds = branch_ids.length > 0 ? [branch_ids[0]] : [];
      } else if (accessUserType === 'branch_admin' || accessUserType === 'admin') {
        payloadBranchIds = accessBranchIds;
      }

      const res = await api.post('/users', {
        ...payload,
        userType: accessUserType,
        branch_ids: payloadBranchIds,
        ...(crossOrgTargetId ? { organizationId: crossOrgTargetId } : {}),
      });
      const newUserId = res.data?.data?.id;

      if (newUserId && form1.position_id) {
        await api.post(`/positions/${form1.position_id}/users`, {
          userId: newUserId,
          ...(crossOrgTargetId ? { organizationId: crossOrgTargetId } : {}),
        });
      }

      if (newUserId && form1.role_id) {
        await api.put(`/users/${newUserId}/roles`, {
          roles: [{ roleId: form1.role_id }]
        });
      }

      if (newUserId) {
        await applyAccessScope(newUserId, form1.position_id);
      }

      onSaved(); onClose();
    } catch (err: any) {
      const status = err.response?.status;
      const msg = (err.response?.data?.error || err.response?.data?.message || '').toLowerCase();
      if (status === 400 || status === 409 || msg.includes('exist') || msg.includes('register') || msg.includes('duplicate')) {
        setErrors1({ _: 'This email address is already registered. Please use a different email address.' });
      } else {
        setErrors1({ _: err.response?.data?.error ?? 'Failed to create user' });
      }
    } finally { setSaving1(false); }
  };

  // ── Method 2 ──────────────────────────────────────────────────────────────

  const goNext = () => {
    if (!selectedEntry) return;
    setStep(skipVerify ? 3 : 2);
  };

  const handleVerify = async () => {
    if (!verifyPassword) { setVerifyError('Password is required'); return; }
    setVerifying(true); setVerifyError('');
    try {
      await api.post('/auth/verify', { email: selectedEntry!.email, password: verifyPassword });
      setStep(3);
    } catch (err: any) {
      setVerifyError(err.response?.data?.error ?? 'Invalid credentials. Please try again.');
    } finally { setVerifying(false); }
  };

  const validate2 = () => {
    const e: Record<string, string> = {};
    if (selectedEntry?.source === 'employee') {
      if (!form2.username.trim()) e.username = 'Username is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form2.username)) e.username = 'Enter a valid email address';
      if (!form2.password)                e.password = 'Password is required';
      else if (form2.password.length < 8) e.password = 'Minimum 8 characters';
      if (form2.password !== form2.confirm_password) e.confirm_password = 'Passwords do not match';
    }
    if (branchLocationRequired && form2.branch_ids.length === 0) e.branch_ids = 'Please select at least one branch';
    Object.assign(e, validateAccessScope());
    setErrors2(e);
    return Object.keys(e).length === 0;
  };

  const submit2 = async () => {
    if (!validate2()) return;
    setSaving2(true);
    try {
      let targetUserId: string | undefined;

      if (selectedEntry!.source === 'user') {
        targetUserId = selectedEntry!.id;
        const memberOrgId = accessUserType === 'org_admin' && accessOrgId ? accessOrgId : selectedTenantId;
        if (memberOrgId) {
          await api.post(`/organizations/${memberOrgId}/members`, {
            userId: selectedEntry!.id,
          });
        }
        if (form2.position_id) {
          await api.post(`/positions/${form2.position_id}/users`, { userId: selectedEntry!.id });
        }
        if (form2.role_id) {
          await api.put(`/users/${selectedEntry!.id}/roles`, {
            roles: [{ roleId: form2.role_id }]
          });
        }
      } else {
        const { branch_ids, username, password, confirm_password, ...invitePayload } = form2;
        let payloadBranchIds: string[] = [];
        if (accessUserType === 'employee') {
          payloadBranchIds = branch_ids.length > 0 ? [branch_ids[0]] : [];
        } else if (accessUserType === 'branch_admin' || accessUserType === 'admin') {
          payloadBranchIds = accessBranchIds;
        }

        const res = await api.post('/users', {
          employee_id: selectedEntry!.id,
          email: username,
          phone: selectedEntry!.phone,
          password,
          ...invitePayload,
          userType: accessUserType,
          branch_ids: payloadBranchIds,
        });
        targetUserId = res.data?.data?.id;
        const newUserId = targetUserId;

        if (newUserId && form2.position_id) {
          await api.post(`/positions/${form2.position_id}/users`, { userId: newUserId });
        }

        if (newUserId && form2.role_id) {
          await api.put(`/users/${newUserId}/roles`, {
            roles: [{ roleId: form2.role_id }]
          });
        }
      }

      if (targetUserId) {
        await applyAccessScope(targetUserId, form2.position_id);
      }

      onSaved(); onClose();
    } catch (err: any) {
      const status = err.response?.status;
      const msg = (err.response?.data?.error || err.response?.data?.message || '').toLowerCase();
      if (status === 400 || status === 409 || msg.includes('exist') || msg.includes('register') || msg.includes('duplicate')) {
        setErrors2({ _: 'This email address is already registered. Please use a different email address.' });
      } else {
        setErrors2({ _: err.response?.data?.error ?? 'Failed to attach user to organization' });
      }
    } finally { setSaving2(false); }
  };

  const handleBack = () => {
    if (step === 1) { onClose(); return; }
    if (step === 3 && skipVerify) { setStep(1); return; }
    setStep(prev => (prev - 1) as 1 | 2 | 3);
  };

  // ── Edit Access ──────────────────────────────────────────────────────────────

  const submitEditAccess = async () => {
    if (!editUser) return;
    const accessErrors = validateAccessScope();
    if (Object.keys(accessErrors).length > 0) {
      setEditError(Object.values(accessErrors)[0]);
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await applyAccessScope(editUser.id, editPositionId);
      onSaved(); onClose();
    } catch (err: any) {
      setEditError(err.response?.data?.error ?? 'Failed to update access');
    } finally { setEditSaving(false); }
  };

  const resetInviteMode = () => {
    setStep(1); setSelectedEntry(null);
    setVerifyPassword(''); setVerifyError('');
    setForm2({
      department_id: '', role_id: '', branch_ids: [], position_id: '', reports_to: '',
      username: '', password: '', confirm_password: '',
    });
    setErrors2({});
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const set1 = (k: keyof typeof form1, v: string) => setForm1(f => ({ ...f, [k]: v }));
  const set2 = (k: keyof typeof form2, v: string) => setForm2(f => ({ ...f, [k]: v }));

  const roleOptions: SelectOption[]   = roles.map(r => ({ value: r.id, label: r.name }));
  const deptOptions: SelectOption[]   = departments.map(d => ({ value: d.id, label: d.name }));
  const branchOptions: SelectOption[] = branches.map(b => ({ value: b.id, label: b.name }));
  const positionOptions: SelectOption[] = positions.map(p => ({ value: p.id, label: p.name }));

  // branch_admin / admin already pick their branch(es) via AccessScopeFields above —
  // showing the generic Branch / Location picker too would just be a duplicate field.
  const showBranchLocationField = accessUserType !== 'branch_admin' && accessUserType !== 'admin' && accessUserType !== 'org_admin';
  // org_admin already has full access to every branch in their organization, so picking
  // specific branches here is optional rather than required.
  const branchLocationRequired = showBranchLocationField;

  const inputCls = (err?: string) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background transition-colors ${
      err ? 'border-red-400' : 'border-border'
    }`;

  const entryName = selectedEntry ? displayName(selectedEntry) : '';

  // ── Edit Access mode ─────────────────────────────────────────────────────────

  if (editUser) {
    return (
      <div className="fixed inset-0 z-40 flex">
        <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="w-full max-w-[480px] bg-background shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="text-base font-bold text-foreground">Edit Access</h2>
              <p className="text-xs text-muted-foreground">{editUser.email || editUser.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {editError && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                {editError}
              </div>
            )}

            {editLoading || dataLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading access settings…</span>
              </div>
            ) : (
              <>
                <section>
                  <SectionTitle>Hierarchy & Scope</SectionTitle>
                  <AccessScopeFields
                    manageableTypes={manageableTypes}
                    branches={branches}
                    userType={accessUserType}
                    onUserTypeChange={setAccessUserType}
                    branchIds={accessBranchIds}
                    onBranchIdsChange={setAccessBranchIds}
                    organizations={organizations}
                    orgId={accessOrgId}
                    onOrgIdChange={setAccessOrgId}
                  />
                  {manageableTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      You don't have permission to change this user's hierarchy/scope.
                    </p>
                  )}
                </section>

                {positionOptions.length > 0 && (
                  <>
                    <div className="border-t border-border" />
                    <section>
                      <SectionTitle>Position</SectionTitle>
                      <SearchableSelect options={positionOptions} value={editPositionId}
                        onChange={setEditPositionId} placeholder="Select position" />
                    </section>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between gap-3">
            <button onClick={onClose}
              className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={submitEditAccess} disabled={editSaving || editLoading || dataLoading}
              className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-[540px] bg-background shadow-2xl flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Add User</h2>
            <p className="text-xs text-muted-foreground">Add a new member to this organization</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Mode Toggle ─────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="grid grid-cols-2 gap-1 bg-muted rounded-xl p-1">
            {(['create', 'invite'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); if (m === 'invite') resetInviteMode(); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'create' ? 'Create New User' : 'Invite Existing User'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Step Indicator (Invite mode) ─────────────────────────────────── */}
        {mode === 'invite' && <StepIndicator step={step} skipVerify={skipVerify} />}

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ════════════ METHOD 1 — Create New User ════════════════════════ */}
          {mode === 'create' && (
            <div className="p-6 space-y-5">
              {errors1._ && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
                  {errors1._}
                </div>
              )}

              <section>
                <SectionTitle>Basic Information</SectionTitle>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel required>First Name</FieldLabel>
                      <input value={form1.first_name} onChange={e => set1('first_name', e.target.value)}
                        placeholder="John" className={inputCls(errors1.first_name)} />
                      {errors1.first_name && <p className="text-xs text-red-500 mt-1">{errors1.first_name}</p>}
                    </div>
                    <div>
                      <FieldLabel required>Last Name</FieldLabel>
                      <input value={form1.last_name} onChange={e => set1('last_name', e.target.value)}
                        placeholder="Smith" className={inputCls(errors1.last_name)} />
                      {errors1.last_name && <p className="text-xs text-red-500 mt-1">{errors1.last_name}</p>}
                    </div>
                  </div>
                  <div>
                    <FieldLabel required>Email Address</FieldLabel>
                    <input type="email" value={form1.email} onChange={e => set1('email', e.target.value)}
                      placeholder="john.smith@company.com" className={inputCls(errors1.email)} />
                    {errors1.email && <p className="text-xs text-red-500 mt-1">{errors1.email}</p>}
                  </div>
                  <div>
                    <FieldLabel>Phone Number</FieldLabel>
                    <input value={form1.phone} onChange={e => set1('phone', e.target.value)}
                      placeholder="+1 234 567 8900" className={inputCls()} />
                  </div>
                  <div>
                    <FieldLabel required>Password</FieldLabel>
                    <PasswordInput value={form1.password} onChange={v => set1('password', v)}
                      placeholder="Min. 8 characters" error={errors1.password} />
                  </div>
                  <div>
                    <FieldLabel required>Confirm Password</FieldLabel>
                    <PasswordInput value={form1.confirm_password} onChange={v => set1('confirm_password', v)}
                      placeholder="Re-enter password" error={errors1.confirm_password} />
                  </div>
                </div>
              </section>

              <div className="border-t border-border" />

              <section>
                <SectionTitle>Organization & Access</SectionTitle>
                <div className="space-y-3">
                  {positionOptions.length > 0 && (
                    <div>
                      <FieldLabel>Position</FieldLabel>
                      <SearchableSelect options={positionOptions} value={form1.position_id}
                        onChange={v => set1('position_id', v)} placeholder="Select position" />
                    </div>
                  )}
                  <AccessScopeFields
                    manageableTypes={manageableTypes}
                    branches={branches}
                    userType={accessUserType}
                    onUserTypeChange={setAccessUserType}
                    branchIds={accessBranchIds}
                    onBranchIdsChange={setAccessBranchIds}
                    organizations={organizations}
                    orgId={accessOrgId}
                    onOrgIdChange={setAccessOrgId}
                    errors={errors1}
                  />
                  {showBranchLocationField && (
                    <div>
                      <FieldLabel required={branchLocationRequired}>Branch / Location</FieldLabel>
                      <SearchableSelect options={branchOptions} value={form1.branch_ids[0] ?? ''}
                        onChange={v => setForm1(f => ({ ...f, branch_ids: v ? [v] : [] }))} placeholder="Select branch" error={!!errors1.branch_ids} />
                      {errors1.branch_ids && <p className="text-xs text-red-500 mt-1">{errors1.branch_ids}</p>}
                    </div>
                  )}
                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(['active', 'inactive'] as const).map(s => (
                        <button key={s} type="button" onClick={() => set1('status', s)}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                            form1.status === s
                              ? s === 'active'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700'
                                : 'bg-slate-50 border-slate-300 text-slate-600 dark:bg-slate-900/30 dark:border-slate-600'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {s === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-border" />

              <section>
                <SectionTitle>Management Hierarchy</SectionTitle>
                <div>
                  <FieldLabel>Reports To / Managed By</FieldLabel>
                  <UserSearchSelect users={orgUsers} value={form1.reports_to}
                    onChange={u => set1('reports_to', u?.id ?? '')}
                    placeholder="Search and select reporting manager…" />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Optional — leave blank if no direct manager applies
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* ════════════ METHOD 2 — Invite Existing ════════════════════════ */}
          {mode === 'invite' && (
            <div className="p-6">

              {/* Step 1 — Search directory */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground bg-muted/40 border border-border rounded-xl px-4 py-3 leading-relaxed">
                    Search across all platform users and HR employee records. Select the person you want to add to this organization.
                  </div>
                  <div>
                    <FieldLabel required>Search Directory</FieldLabel>
                    <DirectorySearchSelect value={selectedEntry} onChange={entry => {
                      setSelectedEntry(entry);
                      if (entry?.source === 'employee') {
                        setForm2(f => ({ ...f, username: entry.email || f.username }));
                      }
                    }} />
                  </div>

                  {selectedEntry && (
                    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <AvatarInitials name={entryName} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-foreground">{entryName}</p>
                          <SourceBadge source={selectedEntry.source} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {selectedEntry.email || selectedEntry.phone || '—'}
                          {selectedEntry.employee_code ? ` · ${selectedEntry.employee_code}` : ''}
                        </p>
                        {(selectedEntry.designation || selectedEntry.department) && (
                          <p className="text-xs text-muted-foreground">
                            {[selectedEntry.designation, selectedEntry.department].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedEntry?.source === 'employee' && (
                    <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3">
                      <Building2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        This is an <strong>HR employee record</strong> with no platform account. A system account will be created for them during assignment.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 — Verify identity (platform users only) */}
              {step === 2 && selectedEntry && !skipVerify && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl p-4">
                    <AvatarInitials name={entryName} size="md" />
                    <div>
                      <p className="font-semibold text-sm">{entryName}</p>
                      <p className="text-xs text-muted-foreground">{selectedEntry.email}</p>
                    </div>
                    <SourceBadge source={selectedEntry.source} />
                  </div>
                  <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <Users className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      Confirm this user's identity before attaching their account to your organization.
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Email</FieldLabel>
                    <input readOnly value={selectedEntry.email ?? ''}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted/40 text-muted-foreground cursor-not-allowed" />
                  </div>
                  <div>
                    <FieldLabel required>User's Password</FieldLabel>
                    <PasswordInput value={verifyPassword} onChange={setVerifyPassword}
                      placeholder="Enter the user's current password" error={verifyError} />
                  </div>
                </div>
              )}

              {/* Step 3 — Assign role & access */}
              {step === 3 && (
                <div className="space-y-4">
                  {errors2._ && (
                    <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-xl px-3 py-2.5">
                      {errors2._}
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      {skipVerify ? 'Employee selected.' : 'Identity verified.'} Assign a role and access settings for{' '}
                      <span className="font-semibold text-foreground">{entryName}</span> within this organization.
                    </p>
                  </div>

                  {selectedEntry?.source === 'employee' && (
                    <>
                      <section>
                        <SectionTitle>Account Credentials</SectionTitle>
                        <div className="space-y-3">
                          <div>
                            <FieldLabel required>Username</FieldLabel>
                            <input value={form2.username} onChange={e => set2('username', e.target.value)}
                              placeholder="john.smith@company.com" className={inputCls(errors2.username)} />
                            {errors2.username && <p className="text-xs text-red-500 mt-1">{errors2.username}</p>}
                          </div>
                          <div>
                            <FieldLabel required>Password</FieldLabel>
                            <PasswordInput value={form2.password} onChange={v => set2('password', v)}
                              placeholder="Min. 8 characters" error={errors2.password} />
                          </div>
                          <div>
                            <FieldLabel required>Confirm Password</FieldLabel>
                            <PasswordInput value={form2.confirm_password} onChange={v => set2('confirm_password', v)}
                              placeholder="Re-enter password" error={errors2.confirm_password} />
                          </div>
                        </div>
                      </section>
                      <div className="border-t border-border" />
                    </>
                  )}

                  <div className="space-y-3">
                    {positionOptions.length > 0 && (
                      <div>
                        <FieldLabel>Position</FieldLabel>
                        <SearchableSelect options={positionOptions} value={form2.position_id}
                          onChange={v => set2('position_id', v)} placeholder="Select position" />
                      </div>
                    )}
                    <AccessScopeFields
                      manageableTypes={manageableTypes}
                      branches={branches}
                      userType={accessUserType}
                      onUserTypeChange={setAccessUserType}
                      branchIds={accessBranchIds}
                      onBranchIdsChange={setAccessBranchIds}
                      organizations={organizations}
                      orgId={accessOrgId}
                      onOrgIdChange={setAccessOrgId}
                      errors={errors2}
                    />
                    {showBranchLocationField && (
                      <div>
                        <FieldLabel required={branchLocationRequired}>Branch / Location</FieldLabel>
                        <SearchableSelect options={branchOptions} value={form2.branch_ids[0] ?? ''}
                          onChange={v => setForm2(f => ({ ...f, branch_ids: v ? [v] : [] }))} placeholder="Select branch" error={!!errors2.branch_ids} />
                        {errors2.branch_ids && <p className="text-xs text-red-500 mt-1">{errors2.branch_ids}</p>}
                      </div>
                    )}
                    <div>
                      <FieldLabel>Reports To / Managed By</FieldLabel>
                      <UserSearchSelect users={orgUsers} value={form2.reports_to}
                        onChange={u => set2('reports_to', u?.id ?? '')}
                        placeholder="Select reporting manager…"
                        excludeIds={selectedEntry ? [selectedEntry.id] : []} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between gap-3">

          {mode === 'create' ? (
            <>
              <button onClick={onClose}
                className="border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={submit1} disabled={saving1 || dataLoading}
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Create User
              </button>
            </>
          ) : (
            <>
              <button onClick={handleBack}
                className="flex items-center gap-2 border border-border rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                {step === 1 ? 'Cancel' : <><ArrowLeft className="w-4 h-4" /> Back</>}
              </button>

              {step === 1 && (
                <button onClick={goNext} disabled={!selectedEntry}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {step === 2 && (
                <button onClick={handleVerify} disabled={verifying}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
                  Verify Identity
                </button>
              )}

              {step === 3 && (
                <button onClick={submit2} disabled={saving2}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {saving2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {selectedEntry?.source === 'employee' ? 'Create & Assign' : 'Attach to Organization'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
