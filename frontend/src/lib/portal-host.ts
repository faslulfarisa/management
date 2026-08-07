export type PortalKind = 'customer' | 'platform' | 'api' | 'unknown';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function splitHostList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter(Boolean);
}

function hostFromUrl(value?: string): string {
  if (!value) return '';
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function normalizeHost(value?: string | null): string {
  if (!value) return '';
  const host = value.trim().toLowerCase();
  if (!host) return '';

  const withoutProtocol = host.includes('://') ? hostFromUrl(host) : host;
  return withoutProtocol.split('/')[0].replace(/^\[/, '').replace(/\]$/, '');
}

function configuredHosts(): Record<Exclude<PortalKind, 'unknown'>, Set<string>> {
  const appHosts = [
    process.env.APP_HOST,
    process.env.NEXT_PUBLIC_APP_HOST,
    hostFromUrl(process.env.NEXT_PUBLIC_APP_URL),
    ...splitHostList(process.env.APP_HOSTS || process.env.NEXT_PUBLIC_APP_HOSTS),
  ];

  const platformHosts = [
    process.env.PLATFORM_HOST,
    process.env.NEXT_PUBLIC_PLATFORM_HOST,
    hostFromUrl(process.env.NEXT_PUBLIC_PLATFORM_URL),
    ...splitHostList(process.env.PLATFORM_HOSTS || process.env.NEXT_PUBLIC_PLATFORM_HOSTS),
  ];

  const apiHosts = [
    process.env.API_HOST,
    process.env.NEXT_PUBLIC_API_HOST,
    hostFromUrl(process.env.NEXT_PUBLIC_API_URL),
    ...splitHostList(process.env.API_HOSTS || process.env.NEXT_PUBLIC_API_HOSTS),
  ];

  return {
    customer: new Set(appHosts.map(normalizeHost).filter(Boolean)),
    platform: new Set(platformHosts.map(normalizeHost).filter(Boolean)),
    api: new Set(apiHosts.map(normalizeHost).filter(Boolean)),
  };
}

export function detectPortalFromHost(host?: string | null): PortalKind {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return 'unknown';

  const hostname = normalizedHost.split(':')[0];
  const hosts = configuredHosts();

  const isPlatformHost = hosts.platform.has(normalizedHost) || hosts.platform.has(hostname);
  const isCustomerHost = hosts.customer.has(normalizedHost) || hosts.customer.has(hostname);
  const isApiHost = hosts.api.has(normalizedHost) || hosts.api.has(hostname);

  if ([isPlatformHost, isCustomerHost, isApiHost].filter(Boolean).length > 1) {
    return 'unknown';
  }

  if (isPlatformHost) return 'platform';
  if (isCustomerHost) return 'customer';
  if (isApiHost) return 'api';

  if (LOCAL_HOSTS.has(hostname)) return 'unknown';

  return 'unknown';
}

export function getCurrentPortalKind(): PortalKind {
  if (typeof window === 'undefined') return 'unknown';
  return detectPortalFromHost(window.location.host);
}

export function getCurrentHost(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.host;
}

export function getCookieDomainAttribute(): string {
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN;
  return cookieDomain ? `; domain=${cookieDomain}` : '';
}

export function getPortalLoginPath(_portal?: Exclude<PortalKind, 'api' | 'unknown'>): string {
  return '/login';
}

function trimTrailingSlash(value?: string): string {
  return value ? value.replace(/\/$/, '') : '';
}

export function getPortalLoginHref(portal: Exclude<PortalKind, 'api' | 'unknown'>): string {
  const baseUrl = portal === 'platform'
    ? trimTrailingSlash(process.env.NEXT_PUBLIC_PLATFORM_URL)
    : trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL);

  return baseUrl ? `${baseUrl}/login` : getPortalLoginPath(portal);
}
