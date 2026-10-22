/**
 * Stateless sessions: a JSON payload plus an HMAC-SHA256 tag, in an HttpOnly
 * cookie. No session table, so an authenticated request costs zero D1 reads —
 * which is what keeps the cold "open the app and type" path fast.
 * Trade-off: logout is client-side only; rotate SESSION_SECRET to revoke all.
 */

const encoder = new TextEncoder();

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
  /** Unix seconds. */
  exp: number;
}

export const SESSION_COOKIE = 'gt_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function sign(payload: object, secret: string): Promise<string> {
  const body = base64urlEncode(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(mac))}`;
}

export async function verify<T>(token: string, secret: string): Promise<T | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      base64urlDecode(mac) as unknown as ArrayBuffer,
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as T;
  } catch {
    return null;
  }
}

export async function createSessionToken(
  user: Omit<SessionPayload, 'exp'>,
  secret: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return sign({ ...user, exp }, secret);
}

export async function readSessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const payload = await verify<SessionPayload>(token, secret);
  if (!payload) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
  return payload;
}
