'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { resetOrgScopedState } from '@/lib/org-switch';
import api from '@/lib/api';

export function OrgSwitcher() {
  const { tenants, activeOrganization, selectedTenantId, selectTenant } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = async (tenantId: string) => {
    if (tenantId === selectedTenantId || switching) return;
    setSwitching(tenantId);
    try {
      const res = await api.post('/auth/select-tenant', { tenantId });
      const { accessToken } = res.data.data;
      // Reset cached queries, in-memory stores, and tenant-scoped storage
      // before the org context changes so nothing from the previous
      // organization can flash or leak into the new one.
      resetOrgScopedState(queryClient);
      selectTenant(tenantId, accessToken);
      setOpen(false);
      // Full page reload ensures all data is refreshed for the new org context
      router.refresh();
      window.location.reload();
    } catch {
      // Silently fail — tenant stays unchanged
    } finally {
      setSwitching(null);
    }
  };

  if (tenants.length <= 1) return null;

  const orgName = activeOrganization?.name ?? 'Select Organization';
  const initials = orgName.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors text-sm max-w-[200px]"
        title={orgName}
      >
        {activeOrganization?.logoUrl ? (
          <img
            src={activeOrganization.logoUrl}
            alt=""
            className="w-5 h-5 rounded object-contain shrink-0"
          />
        ) : (
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(265 65% 50%))' }}
          >
            {initials}
          </div>
        )}
        <span className="truncate font-medium text-foreground">{orgName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Switch Organization
            </p>
          </div>

          {/* Org list */}
          <div className="max-h-64 overflow-y-auto p-1.5">
            {tenants.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No organizations found
              </div>
            )}
            {tenants.map((t) => {
              const isActive = t.id === selectedTenantId;
              const isLoading = switching === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSwitch(t.id)}
                  disabled={isLoading || !!switching}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground'
                  } disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {t.logoUrl ? (
                    <img
                      src={t.logoUrl}
                      alt=""
                      className="w-6 h-6 rounded object-contain shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                      style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(265 65% 50%))' }}
                    >
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    {t.isOrgAdmin && (
                      <p className="text-[10px] text-muted-foreground">Admin</p>
                    )}
                  </div>
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : isActive ? (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}
