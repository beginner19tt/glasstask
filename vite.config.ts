import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

/*
 * Workers AI has no local simulator, so the Cloudflare plugin would open a
 * remote proxy session for the AI binding and demand a CLOUDFLARE_API_TOKEN
 * before `vite dev` will even start. Remote bindings are therefore off by
 * default: D1 runs in miniflare and the /api/ai/* routes fall back to the
 * deterministic parser, so the app runs end to end with no Cloudflare account.
 *
 *   CF_REMOTE_BINDINGS=1 npm run dev   # after `wrangler login`, hit the real model
 *
 * Deploys are unaffected: this flag only applies to the dev server.
 */
export default defineConfig({
  plugins: [react(), cloudflare({ remoteBindings: process.env.CF_REMOTE_BINDINGS === '1' })],
  build: {
    target: 'es2022',
  },
});
