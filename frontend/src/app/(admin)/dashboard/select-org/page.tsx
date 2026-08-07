'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Search, ArrowRight, Loader2, Users } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { resetOrgScopedState } from '@/lib/org-switch';
import api from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  status: string;
  is_org_admin?: boolean;
}

export default function SelectOrgPage() {
  const { tenants, selectTenant, _hydrated } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        setOrgs(
          tenants.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            logo_url: t.logoUrl,
            status: t.status,
            is_org_admin: t.isOrgAdmin,
          })),
        );
      } catch {
        setOrgs([]);
      } finally {
        setLoading(false);
      }
    };

    if (_hydrated) fetchOrgs();
  }, [_hydrated, tenants]);

  const handleSelect = async (orgId: string) => {
    if (selecting) return;
    setSelecting(orgId);
    try {
      const res = await api.post('/auth/select-tenant', { tenantId: orgId });
      const { accessToken } = res.data.data;

      // Reset cached queries, in-memory stores, and tenant-scoped storage
      // before the org context changes so nothing from the previous
      // organization can flash or leak into the new one.
      resetOrgScopedState(queryClient);

      selectTenant(orgId, accessToken);
      router.push('/dashboard');
    } catch {
      setSelecting(null);
    }
  };

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(265 65% 50%))' }}
          >
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Select an Organization</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Choose the organization you want to work in. All actions will be scoped to this organization.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* List */}
        <div
          className="rounded-2xl border border-border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading organizations…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Building2 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No organizations found</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((org) => {
                const isLoading = selecting === org.id;
                const initials = org.name.slice(0, 2).toUpperCase();
                return (
                  <li key={org.id}>
                    <button
                      onClick={() => handleSelect(org.id)}
                      disabled={!!selecting}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed group"
                    >
                      {/* Logo / initials */}
                      {org.logo_url ? (
                        <img
                          src={org.logo_url}
                          alt=""
                          className="w-10 h-10 rounded-xl object-contain border border-border bg-white shrink-0"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(265 65% 50%))' }}
                        >
                          {initials}
                        </div>
                      )}

                      {/* Name & status */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{org.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {org.slug}
                          {org.is_org_admin && (
                            <span className="ml-2 text-primary font-medium">Admin</span>
                          )}
                        </p>
                      </div>

                      {/* Arrow / loader */}
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                      ) : (
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          You can switch organizations at any time from the topbar.
        </p>
      </div>
    </div>
  );
}
