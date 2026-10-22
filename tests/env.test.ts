import { describe, expect, it } from 'vitest';
import { isDevAuth, publicOrigin, sessionSecret } from '../worker/env';
import type { AppEnv } from '../worker/env';

const env = (overrides: Partial<AppEnv> = {}) => overrides as AppEnv;
const at = (href: string) => new URL(href);

describe('isDevAuth', () => {
  it('is on for local hosts, so a fresh clone needs no setup', () => {
    expect(isDevAuth(env(), at('http://localhost:5173/api/auth/dev'))).toBe(true);
    expect(isDevAuth(env(), at('http://127.0.0.1:8787/api/auth/dev'))).toBe(true);
    expect(isDevAuth(env(), at('http://app.localhost:3000/api/auth/dev'))).toBe(true);
  });

  it('is off for any deployed host, whatever the vars say', () => {
    const permissive = env({ DEV_AUTH: '1' });
    expect(isDevAuth(permissive, at('https://glasstask.workers.dev/api/auth/dev'))).toBe(false);
    expect(isDevAuth(permissive, at('https://example.com/api/auth/dev'))).toBe(false);
    // A host that merely contains "localhost" is not a local host.
    expect(isDevAuth(permissive, at('https://localhost.example.com/api/auth/dev'))).toBe(false);
    expect(isDevAuth(permissive, at('https://notlocalhost/api/auth/dev'))).toBe(false);
  });

  it('can be turned off locally too', () => {
    expect(isDevAuth(env({ DEV_AUTH: '0' }), at('http://localhost:5173/'))).toBe(false);
  });
});

describe('sessionSecret', () => {
  it('uses the configured secret wherever it is set', () => {
    expect(sessionSecret(env({ SESSION_SECRET: 'real' }), at('https://glasstask.workers.dev/'))).toBe(
      'real',
    );
  });

  it('falls back to the dev secret only on a local host', () => {
    expect(sessionSecret(env(), at('http://localhost:5173/'))).toContain('dev-only');
  });

  it('fails closed in production rather than signing with a published value', () => {
    expect(() => sessionSecret(env(), at('https://glasstask.workers.dev/'))).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => sessionSecret(env({ DEV_AUTH: '1' }), at('https://example.com/'))).toThrow();
  });
});

describe('publicOrigin', () => {
  it('defaults to the origin the request arrived on', () => {
    expect(publicOrigin(env(), at('https://glasstask.workers.dev/api/auth/google'))).toBe(
      'https://glasstask.workers.dev',
    );
    expect(publicOrigin(env(), at('http://localhost:5173/api/auth/google'))).toBe(
      'http://localhost:5173',
    );
  });

  it('honours an explicit override for proxied deployments', () => {
    expect(
      publicOrigin(env({ APP_ORIGIN: 'https://tasks.example.com' }), at('http://internal:8080/x')),
    ).toBe('https://tasks.example.com');
  });

  it('ignores a malformed override', () => {
    expect(publicOrigin(env({ APP_ORIGIN: 'tasks.example.com' }), at('https://real.dev/x'))).toBe(
      'https://real.dev',
    );
  });
});
