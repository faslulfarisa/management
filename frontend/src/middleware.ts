import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { detectPortalFromHost } from '@/lib/portal-host';

const PLATFORM_PREFIX = '/operations';
const CUSTOMER_PREFIXES = ['/dashboard', '/branch-admin', '/home', '/manager', '/register'];
const BRANCH_ADMIN_PREFIX = '/branch-admin';
const PUBLIC_LOGIN_PATH = '/login';

/**
 * Cross-portal route guard. The hostname is the source of truth:
 * app.* serves customer HRMS routes and platform.* serves operations routes.
 * Login entry points are literal routes and are never rewritten into each
 * other:
 *   /login          -> customer users and normal admins
 *   /admin-login    -> organization admins
 *   /platform-login -> internal platform staff
 *
 * This is defense-in-depth UX routing. Authoritative authorization remains in
 * the backend guards and portal-aware login checks.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const portal = detectPortalFromHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
  );

  if (portal === 'platform') {
    if (CUSTOMER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return NextResponse.redirect(new URL(PUBLIC_LOGIN_PATH, request.url));
    }
  }

  if (portal === 'customer') {
    if (pathname === PLATFORM_PREFIX || pathname.startsWith(`${PLATFORM_PREFIX}/`)) {
      return NextResponse.redirect(new URL(PUBLIC_LOGIN_PATH, request.url));
    }
  }

  if (pathname.startsWith(`${BRANCH_ADMIN_PREFIX}/`)) {
    const dashboardPath = pathname.replace(BRANCH_ADMIN_PREFIX, '/dashboard');
    return NextResponse.rewrite(new URL(dashboardPath + request.nextUrl.search, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/admin-login',
    '/platform-login',
    '/register/:path*',
    '/operations/:path*',
    '/dashboard/:path*',
    '/branch-admin/:path*',
    '/home/:path*',
    '/manager/:path*',
  ],
};
