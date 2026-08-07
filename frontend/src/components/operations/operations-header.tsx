'use client';

import { useAuthStore } from '@/store/auth.store';
import { INTERNAL_ROLE_LABELS, type InternalRole } from '@/lib/internal-roles';
import { LogOut, ChevronDown, Menu, Loader2, UserCircle, Settings } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPostLogoutRedirectPath, rememberPostLogoutRedirectPath } from '@/lib/auth/logout-redirect';

export function OperationsHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout, internalRole, isInternalStaff } = useAuthStore();
  const router = useRouter();
  const [showUser, setShowUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'OP';
  const roleLabel = INTERNAL_ROLE_LABELS[internalRole as InternalRole] || 'Operations';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      setShowUser(false);
      const redirectPath = getPostLogoutRedirectPath({ isInternalStaff });
      rememberPostLogoutRedirectPath(redirectPath);
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

  return (
    <header
      className="h-16 fixed top-0 right-0 left-0 md:left-64 z-10 flex items-center justify-between px-6"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid hsl(220 20% 90%)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuClick} className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-foreground leading-none truncate">Platform Console</h2>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={userRef}>
          <button onClick={() => setShowUser((v) => !v)} className="flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-xl hover:bg-muted transition-colors">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 ops-accent-bg">
              {initials}
            </div>
            <div className="hidden sm:block text-left leading-none">
              <p className="text-sm font-medium text-foreground truncate max-w-[140px]">{user?.email?.split('@')[0] || 'Operations'}</p>
              <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 ${showUser ? 'rotate-180' : ''}`} />
          </button>

          {showUser && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold mb-2 ops-accent-bg">
                  {initials}
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{user?.email}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
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
                  {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  {isLoggingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
