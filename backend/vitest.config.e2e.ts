import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Each file boots the whole app against the local stack (PostgreSQL, Redis, MinIO) and hashes
    // passwords with Argon2id; scenario tests make dozens of real requests. Generous limits keep
    // the suite stable on laptops and CI runners, and a worker cap stops the files starving each other.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    maxWorkers: 4,
  },
});
