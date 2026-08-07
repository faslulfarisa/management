function splitCsv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  return [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.PLATFORM_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_PLATFORM_URL,
    ...splitCsv(process.env.CORS_ORIGINS),
  ].filter((origin): origin is string => Boolean(origin));
}

export function getCorsOriginConfig(): string | string[] {
  const origins = getAllowedOrigins();
  return origins.length ? origins : 'http://localhost:3000';
}

export function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}
