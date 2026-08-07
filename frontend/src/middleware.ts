import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PLATFORM_PREFIX = '/operations';
const CUSTOMER_PREFIXES = ['/dashboard', '/branch-admin', '/home', '/manager'];
const BRANCH_ADMIN_PREFIX = '/branch-admin';

/**
 * Cross-portal route guard. Reads the non-sensitive `portal` cookie set at
 * login (see lib/auth/complete-login.ts) and bounces a session out of the
 * other population's route tree before the page even renders — closing the
 * gap left by the existing per-layout client-side guards, which only run
 * after Zustand hydration. This is defense-in-depth only: it never enforces
 * on a missing cookie (not-yet-logged-in, or a session predating this
 * change), and the real authorization boundary remains the backend guards
 * (InternalStaffGuard/OpsPermissionGuard, ActiveOrgGuard, etc.).
 */
export function middleware(request: NextRequest) {
  const portal = request.cookies.get('portal')?.value;
  const { pathname } = request.nextUrl;

  if (portal === 'customer' && pathname.startsWith(PLATFORM_PREFIX)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (portal === 'platform' && CUSTOMER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.redirect(new URL('/operations', request.url));
  }
  if (pathname.startsWith(`${BRANCH_ADMIN_PREFIX}/`)) {
    const dashboardPath = pathname.replace(BRANCH_ADMIN_PREFIX, '/dashboard');
    return NextResponse.rewrite(new URL(dashboardPath + request.nextUrl.search, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/operations/:path*', '/dashboard/:path*', '/branch-admin/:path*', '/home/:path*', '/manager/:path*'],
};
