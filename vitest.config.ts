import { defineConfig } from 'vitest/config';

// Pure-logic tests only: no Cloudflare plugin here, so the suite stays fast
// and runs in CI without workerd.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
