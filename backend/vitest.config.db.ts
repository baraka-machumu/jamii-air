import { defineConfig } from 'vitest/config';

// Stored-procedure and database security tests (`npm run test:db`), against a Testcontainers
// PostgreSQL 18 with every migration applied (test/db/global-setup.ts).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    globalSetup: ['test/db/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
