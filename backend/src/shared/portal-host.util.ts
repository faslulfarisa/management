import { Request } from 'express';

export type PortalKind = 'customer' | 'platform';

type HostKind = PortalKind | 'api' | 'unknown';

function hostFromUrl(value?: string | string[]): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

export function normalizeHost(value?: string | string[] | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';

  const host = raw.trim().toLowerCase();
  if (!host) return '';

  const withoutProtocol = host.includes('://') ? hostFromUrl(host) : host;
  return withoutProtocol.split('/')[0].replace(/^\[/, '').replace(/\]$/, '');
}

function splitHostList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((host) => normalizeHost(host))
    .filter(Boolean);
}

function configuredHosts(): Record<Exclude<HostKind, 'unknown'>, Set<string>> {
  const appHosts = [
    process.env.APP_HOST,
    hostFromUrl(process.env.APP_URL),
    hostFromUrl(process.env.FRONTEND_URL),
    hostFromUrl(process.env.NEXT_PUBLIC_APP_URL),
    ...splitHostList(process.env.APP_HOSTS),
  ];

  const platformHosts = [
    process.env.PLATFORM_HOST,
    hostFromUrl(process.env.PLATFORM_URL),
    hostFromUrl(process.env.NEXT_PUBLIC_PLATFORM_URL),
    ...splitHostList(process.env.PLATFORM_HOSTS),
  ];

  const apiHosts = [
    process.env.API_HOST,
    hostFromUrl(process.env.API_URL),
    hostFromUrl(process.env.NEXT_PUBLIC_API_URL),
    ...splitHostList(process.env.API_HOSTS),
  ];

  return {
    customer: new Set(appHosts.map(normalizeHost).filter(Boolean)),
    platform: new Set(platformHosts.map(normalizeHost).filter(Boolean)),
    api: new Set(apiHosts.map(normalizeHost).filter(Boolean)),
  };
}

function detectHostKind(host?: string | string[] | null): HostKind {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return 'unknown';

  const hostname = normalizedHost.split(':')[0];
  const hosts = configuredHosts();
  const isPlatformHost = hosts.platform.has(normalizedHost) || hosts.platform.has(hostname);
  const isCustomerHost = hosts.customer.has(normalizedHost) || hosts.customer.has(hostname);

  if (isPlatformHost && !isCustomerHost) return 'platform';
  if (isCustomerHost && !isPlatformHost) return 'customer';
  if (hosts.api.has(normalizedHost) || hosts.api.has(hostname)) return 'api';

  return 'unknown';
}

export function detectPortalFromRequest(req: Request, fallback?: PortalKind): PortalKind | undefined {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostKind = detectHostKind(forwardedHost || req.headers.host);
  if (hostKind === 'platform' || hostKind === 'customer') return hostKind;

  const portalHostKind = detectHostKind(req.headers['x-portal-host']);
  if (portalHostKind === 'platform' || portalHostKind === 'customer') return portalHostKind;

  const originKind = detectHostKind(req.headers.origin || req.headers.referer);
  if (originKind === 'platform' || originKind === 'customer') return originKind;

  return fallback;
}
