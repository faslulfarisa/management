'use client';

import { useAuthStore } from '@/store/auth.store';
import { LogOut, Search, ChevronDown, Sparkles, Loader2, Menu, UserCircle, Settings } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CommandPalette } from './command-palette';
import { NotificationDropdown } from './notification-dropdown';
import { OrgSwitcher } from './org-switcher';
import { BackButton } from './back-button';
import { Breadcrumb } from './breadcrumb';
import { resetOrgScopedState } from '@/lib/org-switch';
import { resolveLabel } from '@/lib/navigation/route-labels';
import { useNavigationHistoryStore } from '@/store/navigation-history.store';
import { USER_TYPE_LABELS } from '@/lib/hierarchy';
import { getPostLogoutRedirectPath, rememberPostLogoutRedirectPath } from '@/lib/auth/logout-redirect';
import { AdminSectionSwitcher } from './admin-section-switcher';
import { useAdminSection } from '@/hooks/use-admin-section';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout, tenants, selectedTenantId, userType, isInternalStaff } = useAuthStore();
  const { isAdminDualContext } = useAdminSection();
  const pathname = usePathname() ?? '/dashboard';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showUser, setShowUser] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const trail = useNavigationHistoryStore((s) => s.trail);

  const title = resolveLabel(pathname);
  const roleLabel = USER_TYPE_LABELS[userType as keyof typeof USER_TYPE_LABELS] || 'Administrator';

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'AD';

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Global ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(v => !v);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      setShowUser(false);
      const redirectPath = getPostLogoutRedirectPath({ isInternalStaff });
      rememberPostLogoutRedirectPath(redirectPath);
      // Clear cached queries / tenant-scoped state so the next login on this
      // browser (possibly a different user/org) doesn't see stale data.
      resetOrgScopedState(queryClient);
      logout();
      await router.push(redirectPath);
    } catch (err) {
      console.error('Logout error:', err);
      setIsLoggingOut(false);
    }
  };

  const goToGlobalProfile = (target: '/profile' | '/account') => {
    setShowUser(false);
    router.push(target);
  };

  // Detect platform for shortcut label
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  return (
    <>
      <header
        className="h-16 fixed top-0 right-0 left-0 md:left-64 z-30 flex items-center justify-between px-6"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid hsl(220 20% 90%)',
        }}
      >
        {/* Left – hamburger menu, back navigation & breadcrumb trail */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BackButton />
          {trail.length > 0 ? (
            <Breadcrumb />
          ) : (
            <h2 className="text-base font-semibold text-foreground leading-none truncate">
              {title}
            </h2>
          )}
        </div>

        {/* Center – section switcher for admin/branch_admin; search trigger for everyone else */}
        {isAdminDualContext ? (
          <AdminSectionSwitcher />
        ) : (
          <button
            id="search-trigger"
            onClick={() => setShowSearch(true)}
            className="hidden md:flex items-center gap-2 bg-muted/60 hover:bg-muted border border-border rounded-xl px-3 py-2 w-64 transition-colors cursor-pointer group"
          >
            <Search className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
            <span className="text-sm text-muted-foreground group-hover:text-foreground/70 transition-colors">Search anything…</span>
            <kbd className="ml-auto text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground">
              {isMac ? '⌘' : 'Ctrl+'}K
            </kbd>
          </button>
        )}

        {/* Right – always-visible actions */}
        <div className="flex items-center gap-2">
          {/* Mobile search button */}
          <button
            onClick={() => setShowSearch(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <Search className="w-[18px] h-[18px] text-muted-foreground" />
          </button>

          {/* Organization switcher */}
          {tenants.length > 1 && (
            <div className="hidden md:block">
              <OrgSwitcher />
            </div>
          )}

          {/* AI badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
            style={{ background: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(220 65% 46%))' }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Powered
          </div>

          {/* Notifications */}
          <NotificationDropdown />

          {/* Divider */}
          <div className="w-px h-6 bg-border mx-1" />

          {/* User menu */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setShowUser(v => !v)}
              className="flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-xl hover:bg-muted transition-colors"
            >
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}
              >
                {initials}
              </div>
              <div className="hidden sm:block text-left leading-none">
                <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
                  {user?.email?.split('@')[0] || 'Admin'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {roleLabel}
                </p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${showUser ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {showUser && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up">
                {/* User info */}
                <div className="px-4 py-3 border-b border-border bg-muted/40">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold mb-2"
                    style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}
                  >
                    {initials}
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{user?.email || 'admin@demo.com'}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel}
                  </p>
                  {selectedTenantId && tenants.length > 0 && (
                    <p className="text-xs text-primary/80 font-medium mt-0.5 truncate max-w-[160px]">
                      {tenants.find((t) => t.id === selectedTenantId)?.name}
                    </p>
                  )}
                </div>
                {/* Actions */}
                <div className="p-1.5">
                  <button
                    onClick={() => goToGlobalProfile('/profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <UserCircle className="w-4 h-4 text-muted-foreground" />
                    My Profile
                  </button>
                  <button
                    onClick={() => goToGlobalProfile('/account')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    Account Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    {isLoggingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPalette open={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
}
