/**
 * Bindings as the Worker actually sees them. `worker-configuration.d.ts` is
 * generated from wrangler.jsonc and types the plain vars as literals, so we
 * widen them here and add the three secrets (set with `wrangler secret put`).
 */
export type AppEnv = Omit<Env, 'APP_ORIGIN' | 'DEV_AUTH'> & {
  APP_ORIGIN?: string;
  DEV_AUTH?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};

/** Only ever reachable on a local host, so local dev needs no secret setup. */
const DEV_SECRET = 'glasstask-dev-only-not-for-production';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Whether the local-only sign-in is available for this request.
 *
 * Deliberately keyed on the request host rather than on a var alone: a var
 * shared by `vite dev` and `wrangler deploy` is one forgotten edit away from
 * shipping an open sign-in to production. A deployed Worker is never reached
 * on localhost, so this is off in production by construction. `DEV_AUTH=0`
 * turns it off locally too.
 */
export function isDevAuth(env: AppEnv, url: URL): boolean {
  if (env.DEV_AUTH === '0') return false;
  const host = url.hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

/**
 * Production must fail closed: with no SESSION_SECRET set, there is no
 * fallback and every authenticated route errors rather than signing cookies
 * with a value that is published in this repository.
 */
export function sessionSecret(env: AppEnv, url: URL): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (isDevAuth(env, url)) return DEV_SECRET;
  throw new Error('SESSION_SECRET is not configured');
}

/**
 * The public origin to build OAuth redirect URIs from. Defaults to the origin
 * the request actually arrived on, which is correct both locally and on
 * workers.dev; APP_ORIGIN only needs setting when the Worker sits behind a
 * proxy or custom domain that it cannot see.
 */
export function publicOrigin(env: AppEnv, url: URL): string {
  return env.APP_ORIGIN && env.APP_ORIGIN.startsWith('http') ? env.APP_ORIGIN : url.origin;
}
