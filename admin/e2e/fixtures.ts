// What the end-to-end run needs to know: the seeded fixtures, and how to get a signed-in page.
//
// The TOTP code is computed with the server's own module (`backend/src/infrastructure/crypto/
// totp.ts`) rather than a second implementation here. The parameters - SHA-1, 6 digits, 30 s -
// then cannot drift apart, which is the same reason `portal:check` uses it (4.2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { totpAt, totpStep } from '../../backend/src/infrastructure/crypto/totp.ts';

export interface Seed {
  api: string;
  admin: { id: string; email: string; password: string; totpSecret: string };
  author: { id: string; username: string };
  reporter: { id: string; username: string };
  postId: string;
  reportId: string;
}

/**
 * Written by `npm run e2e:seed` in backend/. Read per call rather than at import time so the
 * failure, if it is missing, is a readable message in a test rather than a collection error.
 */
export function seed(): Seed {
  const path = join(import.meta.dirname, '.seed.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Seed;
  } catch {
    throw new Error(
      `No fixtures at ${path}. Start the local stack and the API, then run \`npm run e2e:seed\` in backend/.`,
    );
  }
}

/** The 6-digit code an authenticator app would be showing right now. */
export const totpCode = (secret: string) => totpAt(secret, totpStep(Date.now()));

/** The last time step a code was taken from, so this run never sends the same code twice. */
let lastStep = -1;

/**
 * A code the server will accept. It refuses a code it has already seen (`fn_admin_verify_totp`
 * records the step), so signing in twice inside the same 30-second window needs the next window -
 * exactly what a person with an authenticator would wait for. Only reached if a run signs in more
 * than once; the suite signs in once and keeps the session.
 */
export async function freshTotpCode(secret: string): Promise<string> {
  if (totpStep(Date.now()) === lastStep) await nextWindow();
  const step = totpStep(Date.now());
  lastStep = step;
  return totpAt(secret, step);
}

/** Wait until the authenticator would be showing a different code. */
export async function nextWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 500));
}

/**
 * Sign in the way an admin does: email and password, then the code from the authenticator. The
 * fixtures are already enrolled, so this is the ordinary two-step sign-in, not enrollment.
 */
export async function signIn(page: Page, fixtures: Seed = seed()): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(fixtures.admin.email);
  await page.getByLabel('Password').fill(fixtures.admin.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Step two is the same route with new state (4.2): the code field appearing is the step change.
  const code = page.getByLabel('6-digit code');
  await expect(code).toBeVisible();

  // A code the server has already seen is refused, and it cannot know which ones an earlier run
  // spent - two runs inside the same 30-second window would use the same one. So a refusal is
  // answered the way a person would: wait for the next code and try it. Once is enough, because
  // the second code is from a window this process has definitely not used.
  for (const attempt of [0, 1]) {
    if (attempt > 0) await nextWindow();
    await code.fill(await freshTotpCode(fixtures.admin.totpSecret));
    await page.getByRole('button', { name: 'Sign in' }).click();
    // The dashboard is the portal's index, so arriving there is the proof the session took.
    // `waitFor`, not `isVisible`: the latter answers about this instant, which is always "no"
    // the moment after a click.
    const landed = await page.getByRole('heading', { name: 'Dashboard' })
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true, () => false);
    if (landed) return;
  }

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/** A reason note, named after the test that wrote it, so the audit log is readable afterwards. */
export const note = (what: string) => `End-to-end run: ${what}`;
