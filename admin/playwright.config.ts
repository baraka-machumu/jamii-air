// Playwright for the portal's exit path (Plan 4.8, Phase 4 exit): from a real browser, with real
// 2FA, against a real API and database - resolve a report, hide a post, suspend and reinstate a
// user, create an invite code, and find each of them in the audit log.
//
// The portal is served by Vite on localhost, not by a preview of the build, because the admin
// refresh cookie is `Secure` + `SameSite=strict` and only `localhost` counts as a secure origin
// over plain HTTP (the same reason development runs there, 4.2). Vite proxies /api, so the browser
// makes same-origin requests exactly as it will behind nginx (4.7).
//
// The API and the local stack are not started here: `npm run e2e` expects them up and seeded
// (`npm run e2e:seed` in backend/), the same way the backend's own e2e tests expect their
// infrastructure. CI does both in order.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  // The run drives one shared database: two workers would fight over the same seeded report.
  workers: 1,
  fullyParallel: false,
  // A test that resolves a report cannot pass on a second attempt - the report is closed. A
  // failure here is a real failure, so it is reported rather than retried.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
