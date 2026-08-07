import { afterEach, describe, expect, it } from 'vitest';
import { detectPortalFromHost } from './portal-host';

const ENV_KEYS = [
  'NEXT_PUBLIC_APP_HOST',
  'NEXT_PUBLIC_PLATFORM_HOST',
  'NEXT_PUBLIC_API_HOST',
  'NEXT_PUBLIC_APP_HOSTS',
  'NEXT_PUBLIC_PLATFORM_HOSTS',
  'NEXT_PUBLIC_API_HOSTS',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_PLATFORM_URL',
  'NEXT_PUBLIC_API_URL',
  'APP_HOST',
  'PLATFORM_HOST',
  'API_HOST',
  'APP_HOSTS',
  'PLATFORM_HOSTS',
  'API_HOSTS',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetPortalEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(resetPortalEnv);

describe('detectPortalFromHost', () => {
  it('detects distinct configured customer and platform hosts', () => {
    process.env.NEXT_PUBLIC_APP_HOST = 'app.localhost:3000';
    process.env.NEXT_PUBLIC_PLATFORM_HOST = 'platform.localhost:3000';

    expect(detectPortalFromHost('app.localhost:3000')).toBe('customer');
    expect(detectPortalFromHost('platform.localhost:3000')).toBe('platform');
  });

  it('does not classify an ambiguous host as platform', () => {
    process.env.NEXT_PUBLIC_APP_HOST = 'localhost:3000';
    process.env.NEXT_PUBLIC_PLATFORM_HOST = 'localhost:3000';

    expect(detectPortalFromHost('localhost:3000')).toBe('unknown');
  });
});
