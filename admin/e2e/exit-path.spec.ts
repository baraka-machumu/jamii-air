// The Phase 4 exit path (Plan §4 Phase 4, task 4.8), in one browser session against the real API:
//
//   an admin with 2FA signs in → resolves a report → hides a post → suspends and reinstates a
//   user → creates an invite code → and finds every one of those actions in the audit log.
//
// It is one `test.describe.serial` sharing a page, in that order, because the steps depend on each
// other: the report the first step resolves is the one the seed created, and the audit log can
// only show what the earlier steps did. Playwright is configured with one worker and no retries
// for the same reason - a resolved report cannot be resolved again.
import { expect, test, type Page } from '@playwright/test';
import { note, seed, signIn } from './fixtures';

const fixtures = seed();

/**
 * One page, one session, for the whole path. Signing in per test would need a new authenticator
 * code each time, and the server refuses a code it has already seen - so six tests would mean
 * three minutes of waiting for time windows to pass. One session is also what the exit criterion
 * describes: an admin signs in and does the job.
 */
let page: Page;

/**
 * Status words are asserted with `.first()`: the badge beside the heading is the page's own status,
 * and the same word can appear again lower down - a hidden post in the author's grid, a status
 * column in a table of reports.
 */

/**
 * A sidebar link, scoped to the navigation landmark: the dashboard also links to these screens
 * ("Go to reports"), so an unscoped name matches twice.
 */
const section = (name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true });

test.describe.serial('the portal does the job Phase 4 exists for', () => {
  test.beforeAll(async ({ browser }) => {
    // Signing in can have to wait for the next 30-second code window if a previous run spent this
    // one, which is longer than a hook's default budget.
    test.setTimeout(120_000);
    page = await browser.newPage();
    await signIn(page, fixtures);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('an admin is signed in, with 2FA, and the portal knows who they are', async () => {
    await expect(page.getByText('E2E Admin')).toBeVisible();
    // The dashboard counts the seeded report, so the queue is worth opening.
    await expect(page.getByText('Open reports')).toBeVisible();
  });

  test('a report is resolved', async () => {
    await section('Reports').click();
    await expect(page.getByRole('heading', { name: 'Reports', exact: true, level: 1 })).toBeVisible();

    // The seeded report is the one about the seeded author, filed for spam.
    await page.goto(`/reports/${fixtures.reportId}`);
    await expect(page.getByRole('heading', { name: /reported for spam/i })).toBeVisible();
    await expect(page.getByText(`@${fixtures.author.username}`).first()).toBeVisible();
    // Opening it moves it to REVIEWING (App Flow §15.4 step 2).
    await expect(page.getByText('Reviewing').first()).toBeVisible();

    await page.getByRole('button', { name: 'Resolve' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(note('resolving the seeded report'));
    await dialog.getByRole('button', { name: 'Resolve' }).click();

    await expect(page.getByText('Report resolved')).toBeVisible();
    // Resolving sends the moderator back to the queue (App Flow §15.4 step 4).
    await expect(page).toHaveURL(/\/reports$/);

    // And it is closed for good: reopening shows the decision, not the buttons.
    await page.goto(`/reports/${fixtures.reportId}`);
    await expect(page.getByText(/this report is resolved/i)).toBeVisible();
  });

  test('a post is hidden, and can be restored', async () => {
    await page.goto(`/posts/${fixtures.postId}`);
    await expect(page.getByRole('heading', { name: 'Post', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Published').first()).toBeVisible();

    await page.getByRole('button', { name: 'Hide the post' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(note('hiding the seeded post'));
    await dialog.getByRole('button', { name: 'Hide' }).click();

    await expect(page.getByText('Post hidden')).toBeVisible();
    await expect(page.getByText('Hidden').first()).toBeVisible();
    // Hidden content can be undone, which is what makes hiding safe to do (App Flow §15.4).
    await expect(page.getByRole('button', { name: 'Restore the post' })).toBeVisible();
  });

  test('a user is suspended and then reinstated', async () => {
    await page.goto(`/users/${fixtures.author.id}`);
    await expect(page.getByRole('heading', { name: 'E2E Author', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Suspend the account' }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/logs them out and hides their content/i)).toBeVisible();
    await dialog.getByLabel('Reason').fill(note('suspending the seeded author'));
    await dialog.getByRole('button', { name: 'Suspend' }).click();

    await expect(page.getByText('Account suspended')).toBeVisible();
    await expect(page.getByText('Suspended').first()).toBeVisible();

    await page.getByRole('button', { name: 'Reinstate the account' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(note('reinstating the seeded author'));
    await dialog.getByRole('button', { name: 'Reinstate' }).click();

    await expect(page.getByText('Account reinstated')).toBeVisible();
    await expect(page.getByText('Active').first()).toBeVisible();
  });

  test('an invite code is created and can be revoked', async () => {
    await section('Invite codes').click();
    await page.getByRole('button', { name: 'Create a code' }).click();

    const form = page.getByRole('dialog');
    await form.getByLabel('How many people can use it').fill('2');
    await form.getByLabel('Note (optional)').fill(note('creating an invite code'));
    await form.getByRole('button', { name: 'Create' }).click();

    // The code is shown once, on the spot, because it has to be handed over.
    const shown = page.getByRole('dialog');
    await expect(shown.getByText('The code is ready')).toBeVisible();
    const code = (await shown.locator('p.font-mono').innerText()).trim();
    expect(code).not.toEqual('');
    await shown.getByRole('button', { name: 'Done' }).click();

    // And it is in the table afterwards, with the uses it was given.
    const row = page.getByRole('row', { name: new RegExp(code) });
    await expect(row).toBeVisible();
    await expect(row.getByText('0 of 2')).toBeVisible();

    await row.getByRole('button', { name: 'Revoke' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(note('revoking the invite code'));
    await dialog.getByRole('button', { name: 'Revoke' }).click();

    await expect(page.getByText('Invite code revoked')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(code) }).getByText('Revoked')).toBeVisible();
  });

  test('every action is in the audit log, with the reason it was given', async () => {
    await section('Audit log').click();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();

    const log = page.getByRole('table');
    for (const action of [
      'Resolved a report',
      'Hid a post',
      'Suspended the account',
      'Reinstated the account',
      'Created an invite code',
      'Revoked an invite code',
    ]) {
      await expect(log.getByText(action, { exact: true }).first()).toBeVisible();
    }

    // The note is the point of requiring one: it is on the row, not just in the database.
    await expect(log.getByText(note('suspending the seeded author'))).toBeVisible();

    // And the log is filterable, which is how it stays usable past the pilot's first week.
    await page.getByLabel('Action').selectOption('HIDE_POST');
    await expect(log.getByText('Hid a post').first()).toBeVisible();
    await expect(log.getByText('Suspended the account')).toHaveCount(0);
  });

  // Last, because it ends the session this file shares. Log out lives behind the account menu,
  // and a real browser is the only place that menu can be driven honestly: in jsdom the portal
  // and the dismiss layer do not behave as they do here, so the unit test opens it with a
  // pointerdown instead (src/App.test.tsx).
  test('the admin can sign out from the account menu', async () => {
    await page.getByRole('button', { name: 'Account: E2E Admin' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await expect(page.getByRole('heading', { name: 'Jamii Air Admin' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
