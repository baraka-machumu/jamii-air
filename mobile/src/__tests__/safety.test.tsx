// Task 3.11 against a stubbed API: block and unblock (post ⋯, profile, Blocked accounts), the
// Report sheet (post, comment, account; then the offer to block), Delete account, and a
// suspension noticed mid-session (App Flow §10, §13).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { closeSheet } from '@/components/Sheet';
import { hideToast } from '@/components/Toast';
import { useFollowStore } from '@/people/follow';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';
import { pressSheet, sheetOptions } from '@/test/sheet';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const author = (username: string, id = `id-${username}`) => ({ id, username, displayName: null, avatarUrl: null });
const post = (n: number, by = author('juma')) => ({
  id: `p${n}`, status: 'PUBLISHED', caption: `Caption ${n}`, likeCount: 0, commentCount: 1, likedByMe: false, isMine: false,
  author: by, media: [{ id: `m${n}`, kind: 'IMAGE', blurhash: null, url: `http://img/${n}.webp`, thumbUrl: null, width: 1080, height: 1080 }],
  shareUrl: `https://jamii.test/p/p${n}`, createdAt: new Date().toISOString(),
});
const profile = (blocked: boolean) => ({
  ...author('juma'), bio: 'Fundi wa simu', avatarLargeUrl: null, postCount: 3, followerCount: 41, followingCount: 9,
  isMe: false, isFollowing: !blocked, followsMe: !blocked, isBlockedByMe: blocked, shareUrl: 'https://jamii.test/u/juma', createdAt: '',
});
const blockedUser = (username: string) => ({ ...author(username), blockedAt: new Date().toISOString() });

let requests: StubRequest[];
let alert: jest.SpyInstance;
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

/** A small server: who is blocked, what a block / report / delete answers. */
function api(overrides: (req: StubRequest) => Response | undefined = () => undefined, blocked = new Set<string>()) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    const block = /^\/api\/v1\/users\/(.+)\/block$/.exec(req.path);
    if (block) {
      if (req.method === 'PUT') blocked.add(block[1]!); else blocked.delete(block[1]!);
      return json(200, { blocked: req.method === 'PUT' });
    }
    if (req.path === '/api/v1/me') return req.method === 'DELETE' ? json(200, { deletionDueAt: '2026-11-13T09:00:00.000Z' }) : json(200, me);
    if (req.path === '/api/v1/feed') {
      const items = [post(1), post(2, author('neema'))].filter((p) => !blocked.has(p.author.id));
      return json(200, { items, nextCursor: null });
    }
    if (req.path === '/api/v1/users/juma') return json(200, profile(blocked.has('id-juma')));
    if (req.path === '/api/v1/me/blocks') return json(200, { items: [...blocked].map((id) => blockedUser(id.replace('id-', ''))), nextCursor: null });
    if (req.path === '/api/v1/reports') return json(201, { id: 'r1' });
    if (req.path === '/api/v1/posts/p1') return json(200, post(1));
    if (req.path === '/api/v1/posts/p1/comments') {
      return json(200, { items: [{ id: 'c1', body: 'Comment 1', author: author('neema'), canDelete: false, createdAt: new Date().toISOString() }], nextCursor: null });
    }
    return json(200, emptyPage);
  });
}

beforeEach(async () => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false, notice: null });
  useSettings.setState({ language: 'en', theme: 'system' });
  useFollowStore.setState({ chosen: {}, pending: {} });
  hideToast();
  closeSheet();
});

afterEach(() => alert.mockRestore());

const sheet = () => within(screen.getByTestId('sheet'));

describe('Block (§10.1)', () => {
  it("blocks from a post's ⋯: the sheet explains, then their posts leave the feed", async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(screen.getByLabelText('Post by juma')).getByLabelText('More options'));
    pressSheet('Block @juma');
    expect(sheet().getByText('Block @juma?')).toBeTruthy();
    expect(sheet().getByText(/They won't be notified/)).toBeTruthy();
    fireEvent.press(sheet().getByRole('button', { name: 'Block' }));
    expect(await screen.findByText('Blocked @juma')).toBeTruthy();
    expect(sent('PUT', '/api/v1/users/id-juma/block')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText(/Caption 1/)).toBeNull());
    expect(screen.getByText(/Caption 2/)).toBeTruthy(); // neema's post stays
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('keeps the sheet open with the reason when blocking fails', async () => {
    api((req) => (req.path.endsWith('/block') ? apiError(429, 'RATE_LIMITED') : undefined));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(screen.getByLabelText('Post by juma')).getByLabelText('More options'));
    pressSheet('Block @juma');
    fireEvent.press(sheet().getByRole('button', { name: 'Block' }));
    expect(await sheet().findByText("You're doing that too fast. Try again in a moment.")).toBeTruthy();
    expect(screen.getByText(/Caption 1/)).toBeTruthy();
  });

  it('blocks and unblocks from the profile; a blocked profile shows Unblock instead of Follow', async () => {
    renderRouter(routes, { initialUrl: '/u/juma' });
    expect(await screen.findByText('Fundi wa simu')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('More options'));
    expect(sheetOptions()).toEqual(['Report', 'Block @juma', 'Copy profile link', 'Share profile', 'Cancel']);
    pressSheet('Block @juma');
    fireEvent.press(sheet().getByRole('button', { name: 'Block' }));
    expect(await screen.findByText('You blocked this account.')).toBeTruthy();
    expect(screen.queryByText('Follows you')).toBeNull();

    fireEvent.press(screen.getByLabelText('More options'));
    expect(sheetOptions()).toContain('Unblock @juma');
    closeSheet();
    fireEvent.press(screen.getByRole('button', { name: 'Unblock' }));
    expect(await screen.findByText('Unblocked @juma')).toBeTruthy();
    expect(sent('DELETE', '/api/v1/users/id-juma/block')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('You blocked this account.')).toBeNull());
  });
});

describe('Blocked accounts (§10.1, §11)', () => {
  it('opens from Settings, lists the accounts and unblocks one', async () => {
    api(undefined, new Set(['id-juma', 'id-neema']));
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Blocked accounts' }));
    expect(await screen.findByText('juma')).toBeTruthy();
    expect(screen.getByText('neema')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Unblock @juma' }));
    await waitFor(() => expect(screen.queryByText('juma')).toBeNull());
    expect(screen.getByText('neema')).toBeTruthy();
    expect(sent('DELETE', '/api/v1/users/id-juma/block')).toHaveLength(1);
  });

  it('says so when nobody is blocked', async () => {
    renderRouter(routes, { initialUrl: '/settings/blocked' });
    expect(await screen.findByText('No blocked accounts')).toBeTruthy();
  });
});

describe('Report (§10.2)', () => {
  it('reports a post with a reason and details, then offers to block', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(screen.getByLabelText('Post by juma')).getByLabelText('More options'));
    expect(sheetOptions()).toEqual(['Report', 'Copy link', 'Unfollow', 'Block @juma', 'Cancel']);
    pressSheet('Report');
    expect(sheet().getByText('Report post')).toBeTruthy();
    const submit = sheet().getByRole('button', { name: 'Submit' });
    expect(submit.props.accessibilityState.disabled).toBe(true); // a reason first
    fireEvent.press(sheet().getByRole('radio', { name: 'Harassment or bullying' }));
    fireEvent.changeText(sheet().getByLabelText('Add details (optional)'), '  Keeps sending threats  ');
    fireEvent.press(sheet().getByRole('button', { name: 'Submit' }));
    expect(await sheet().findByText("Thanks — we'll review this.")).toBeTruthy();
    expect(sent('POST', '/api/v1/reports')[0]!.body).toEqual({ targetType: 'POST', targetId: 'p1', reason: 'HARASSMENT', details: 'Keeps sending threats' });

    fireEvent.press(sheet().getByRole('button', { name: 'Block @juma' }));
    expect(sheet().getByText('Block @juma?')).toBeTruthy();
  });

  it("reports someone else's comment", async () => {
    renderRouter(routes, { initialUrl: '/p/p1/comments' });
    fireEvent(await screen.findByText(/Comment 1/), 'longPress');
    pressSheet('Report');
    expect(sheet().getByText('Report comment')).toBeTruthy();
    fireEvent.press(sheet().getByRole('radio', { name: 'Spam' }));
    fireEvent.press(sheet().getByRole('button', { name: 'Submit' }));
    expect(await sheet().findByText("Thanks — we'll review this.")).toBeTruthy();
    expect(sent('POST', '/api/v1/reports')[0]!.body).toEqual({ targetType: 'COMMENT', targetId: 'c1', reason: 'SPAM' });
  });

  it('reports an account you blocked without offering to block again', async () => {
    api(undefined, new Set(['id-juma']));
    renderRouter(routes, { initialUrl: '/u/juma' });
    expect(await screen.findByText('You blocked this account.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('More options'));
    pressSheet('Report');
    expect(sheet().getByText('Report account')).toBeTruthy();
    fireEvent.press(sheet().getByRole('radio', { name: 'Something else' }));
    fireEvent.press(sheet().getByRole('button', { name: 'Submit' }));
    expect(await sheet().findByText("Thanks — we'll review this.")).toBeTruthy();
    expect(sheet().queryByRole('button', { name: 'Block @juma' })).toBeNull();
    fireEvent.press(sheet().getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('shows why a report was refused, in the sheet', async () => {
    api((req) => (req.path === '/api/v1/reports' ? apiError(400, 'CANNOT_REPORT_SELF') : undefined));
    renderRouter(routes, { initialUrl: '/u/juma' });
    fireEvent.press(await screen.findByLabelText('More options'));
    pressSheet('Report');
    fireEvent.press(sheet().getByRole('radio', { name: 'Spam' }));
    fireEvent.press(sheet().getByRole('button', { name: 'Submit' }));
    expect(await sheet().findByText("You can't report yourself or your own posts.")).toBeTruthy();
  });
});

describe('Delete account (§10.4)', () => {
  it('asks for the password again; a wrong one says so under the field', async () => {
    api((req) => (req.method === 'DELETE' && req.path === '/api/v1/me' ? apiError(403, 'INVALID_PASSWORD') : undefined));
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByText(/Log in within 30 days/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Enter your password to confirm'), 'wrong-pass');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
    expect(useSession.getState().status).toBe('signedIn');
  });

  it('deletes, signs out and tells Welcome when the deletion happens', async () => {
    renderRouter(routes, { initialUrl: '/settings/delete-account' });
    fireEvent.changeText(await screen.findByLabelText('Enter your password to confirm'), 'correct-horse');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Your account is scheduled for deletion')).toBeTruthy();
    expect(screen.getByText(/^It will be deleted on .*13.*2026\. Log in before then to cancel\.$/)).toBeTruthy();
    expect(sent('DELETE', '/api/v1/me')[0]!.body).toEqual({ password: 'correct-horse' });
    expect(await tokenStore.get()).toBeNull();
    expect(sent('POST', '/api/v1/auth/logout')).toHaveLength(0); // the server already ended the sessions
  });
});

describe('Suspended mid-session (§13)', () => {
  it('signs out and explains on Welcome', async () => {
    // The server refuses the account everywhere: requests answer 403, a refresh 401.
    api((req) => (req.path === '/api/v1/auth/refresh' ? apiError(401, 'ACCOUNT_NOT_ACTIVE')
      : req.path === '/api/v1/feed' ? apiError(403, 'ACCOUNT_SUSPENDED') : undefined));
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Your account is suspended')).toBeTruthy();
    expect(screen.getByText('Your account is suspended. Contact support for help.')).toBeTruthy();
    expect(useSession.getState().status).toBe('signedOut');
    expect(await tokenStore.get()).toBeNull();
  });

  it('keeps the notice through a second sign-out, forgets it at the next sign-in', () => {
    act(() => useSession.getState().signOut({ kind: 'suspended' }));
    act(() => useSession.getState().signOut());
    expect(useSession.getState().notice).toEqual({ kind: 'suspended' });
    act(() => useSession.getState().signIn('access-1', { id: 'u1' }));
    expect(useSession.getState().notice).toBeNull();
  });
});
