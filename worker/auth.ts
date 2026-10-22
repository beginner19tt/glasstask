import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv } from './env';
import { isDevAuth, sessionSecret } from './env';
import {
  createSessionToken,
  readSessionToken,
  sign,
  verify,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from './session';
import type { SessionPayload } from './session';
import { upsertUser } from './db';

const OAUTH_COOKIE = 'gt_oauth';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

interface OAuthState {
  state: string;
  verifier: string;
  exp: number;
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function s256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decodes an id_token payload without verifying the signature. That is safe
// here and only here: the token came straight from the Google token endpoint
// over TLS, so it was never handled by the browser.
function decodeIdToken(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bytes = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(buf)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function originOf(env: AppEnv, url: URL): string {
  return env.APP_ORIGIN && env.APP_ORIGIN.startsWith('http') ? env.APP_ORIGIN : url.origin;
}

function secureCookie(url: URL): boolean {
  return url.protocol === 'https:';
}

export async function currentSession(
  env: AppEnv,
  cookieValue: string | undefined,
): Promise<SessionPayload | null> {
  return readSessionToken(cookieValue, sessionSecret(env));
}

export const authRoutes = new Hono<{ Bindings: AppEnv }>();

authRoutes.get('/google', async (c) => {
  const env = c.env;
  if (!env.GOOGLE_CLIENT_ID) return c.json({ error: 'google_not_configured' }, 503);

  const url = new URL(c.req.url);
  const state = randomString(16);
  const verifier = randomString(48);
  const payload: OAuthState = { state, verifier, exp: Math.floor(Date.now() / 1000) + 600 };
  setCookie(c, OAUTH_COOKIE, await sign(payload, sessionSecret(env)), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureCookie(url),
    path: '/',
    maxAge: 600,
  });

  const authUrl = new URL(GOOGLE_AUTH);
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', originOf(env, url) + '/api/auth/callback');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', await s256(verifier));
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');
  return c.redirect(authUrl.toString(), 302);
});

authRoutes.get('/callback', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stored = await verify<OAuthState>(getCookie(c, OAUTH_COOKIE) ?? '', sessionSecret(env));
  deleteCookie(c, OAUTH_COOKIE, { path: '/' });

  if (!code || !state || !stored || stored.state !== state || stored.exp * 1000 < Date.now()) {
    return c.redirect('/?auth=failed', 302);
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return c.redirect('/?auth=unconfigured', 302);
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: originOf(env, url) + '/api/auth/callback',
      grant_type: 'authorization_code',
      code_verifier: stored.verifier,
    }),
  });
  if (!tokenResponse.ok) return c.redirect('/?auth=token_failed', 302);

  const tokens = (await tokenResponse.json()) as { id_token?: string };
  const claims = tokens.id_token ? decodeIdToken(tokens.id_token) : null;
  const sub = typeof claims?.sub === 'string' ? claims.sub : null;
  if (!sub) return c.redirect('/?auth=no_identity', 302);

  const user = {
    id: 'google:' + sub,
    email: typeof claims?.email === 'string' ? claims.email : '',
    name: typeof claims?.name === 'string' ? claims.name : '',
    picture: typeof claims?.picture === 'string' ? claims.picture : '',
  };
  await upsertUser(env.DB, user);

  setCookie(
    c,
    SESSION_COOKIE,
    await createSessionToken(
      { sub: user.id, email: user.email, name: user.name, picture: user.picture },
      sessionSecret(env),
    ),
    {
      httpOnly: true,
      sameSite: 'Lax',
      secure: secureCookie(url),
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  return c.redirect('/', 302);
});

// Local-only sign-in so the whole app, and the browser test pass, can run
// without Google credentials. Gated on DEV_AUTH, which production never sets.
authRoutes.post('/dev', async (c) => {
  const env = c.env;
  if (!isDevAuth(env)) return c.json({ error: 'disabled' }, 404);
  const url = new URL(c.req.url);
  const user = { id: 'dev:local', email: 'dev@localhost', name: 'Dev User', picture: '' };
  await upsertUser(env.DB, user);
  setCookie(
    c,
    SESSION_COOKIE,
    await createSessionToken(
      { sub: user.id, email: user.email, name: user.name, picture: user.picture },
      sessionSecret(env),
    ),
    {
      httpOnly: true,
      sameSite: 'Lax',
      secure: secureCookie(url),
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  return c.json({ user });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});
