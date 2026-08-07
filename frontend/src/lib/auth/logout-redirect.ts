const CUSTOMER_LOGIN_PATH = '/login';
const PLATFORM_LOGIN_PATH = '/login';
const POST_LOGOUT_REDIRECT_KEY = 'post_logout_redirect_path';
const ALLOWED_LOGOUT_REDIRECT_PATHS = new Set([CUSTOMER_LOGIN_PATH, PLATFORM_LOGIN_PATH]);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const cookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null;
}

export function getPostLogoutRedirectPath(session?: { isInternalStaff?: boolean | null }) {
  if (session?.isInternalStaff) return PLATFORM_LOGIN_PATH;

  const portal = readCookie('portal');
  if (portal === 'platform') return PLATFORM_LOGIN_PATH;

  if (typeof localStorage !== 'undefined' && localStorage.getItem('is_internal_staff') === 'true') {
    return PLATFORM_LOGIN_PATH;
  }

  return CUSTOMER_LOGIN_PATH;
}

export function rememberPostLogoutRedirectPath(path: string) {
  if (typeof sessionStorage === 'undefined' || !ALLOWED_LOGOUT_REDIRECT_PATHS.has(path)) return;
  sessionStorage.setItem(POST_LOGOUT_REDIRECT_KEY, path);
}

export function consumePostLogoutRedirectPath() {
  if (typeof sessionStorage === 'undefined') return null;

  const path = sessionStorage.getItem(POST_LOGOUT_REDIRECT_KEY);
  sessionStorage.removeItem(POST_LOGOUT_REDIRECT_KEY);

  return path && ALLOWED_LOGOUT_REDIRECT_PATHS.has(path) ? path : null;
}
