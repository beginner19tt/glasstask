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

/** Only ever used when DEV_AUTH is on, so local dev needs no secret setup. */
const DEV_SECRET = 'glasstask-dev-only-not-for-production';

export function sessionSecret(env: AppEnv): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.DEV_AUTH === '1') return DEV_SECRET;
  throw new Error('SESSION_SECRET is not configured');
}

export function isDevAuth(env: AppEnv): boolean {
  return env.DEV_AUTH === '1';
}
