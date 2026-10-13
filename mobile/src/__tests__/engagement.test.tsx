// Task 3.9 against a stubbed API: like (button, double-tap, debounce, failure), comments (list,
// send, retry, delete, closed, counter), share and copy link, and deep links that wait for log-in
// (App Flow §7.1–7.3, §12).
import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton, Share } from 'react-native';
import { createQueryClient } from '@/api/queryClient';
import { feedKey, patchPost, type Post } from '@/api/posts';
import { tokenStore } from '@/auth/tokenStore';
import { closeSheet } from '@/components/Sheet';
import { hideToast } from '@/components/Toast';
import { resetLikes } from '@/engagement/likes';
import { linkTarget, rememberLink } from '@/links/pendingLink';
import { useFollowStore } from '@/people/follow';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';
import { pressSheet, sheetOptions } from '@/test/sheet';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const author = (username: string, id = `id-${username}`) => ({ id, username, displayName: null, avatarUrl: null });
const post = (n: number, extra: object = {}) => ({
  id: `p${n}`, status: 'PUBLISHED', caption: `Caption ${n}`, likeCount: 12, commentCount: 2, likedByMe: false, isMine: false,
  author: author('juma'), media: [{ id: `m${n}`, kind: 'IMAGE', blurhash: null, url: `http://img/${n}.webp`, thumbUrl: null, width: 1080, height: 1080 }],
  shareUrl: `https://jamii.test/p/p${n}`, createdAt: new Date(Date.now() - 3600 * 1000).toISOString(), ...extra,
});
const comment = (n: number, extra: object = {}) => ({
  id: `c${n}`, body: `Comment ${n}`, author: author('neema'), canDelete: false, createdAt: new Date(Date.now() - 60_000).toISOString(), ...extra,
});

let requests: StubRequest[];
let alert: jest.SpyInstance;
const answerAlert = (text: string) => {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  act(() => buttons.find((b) => b.text === text)!.onPress!());
};
const clipboard = () => (jest.requireMock('expo-clipboard') as { mockClipboard: { text: string } }).mockClipboard.text;
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') return json(200, { items: [post(1), post(2, { isMine: true, author: author('amina', 'u1') })], nextCursor: null });
    if (req.path === '/api/v1/posts/p1/like') return json(200, { liked: req.method === 'PUT', likeCount: req.method === 'PUT' ? 13 : 12 });
    if (req.path === '/api/v1/posts/p1/comments' && req.method === 'GET') {
      return json(200, { items: [comment(2, { author: author('amina', 'u1'), canDelete: true }), comment(1)], nextCursor: null });
    }
    if (req.path === '/api/v1/posts/p1/comments') {
      return json(201, { id: 'c3', postId: 'p1', body: req.body.body, createdAt: new Date().toISOString(), commentCount: 3 });
    }
    if (req.path === '/api/v1/comments/c2') return json(200, { deleted: true, commentCount: 1 });
    if (req.path === '/api/v1/posts/p1') return json(200, post(1));
    if (req.path === '/api/v1/users/juma') {
      return json(200, { ...author('juma'), bio: null, avatarLargeUrl: null, postCount: 0, followerCount: 1, followingCount: 1, isMe: false,
        isFollowing: true, followsMe: false, isBlockedByMe: false, shareUrl: 'https://jamii.test/u/juma', createdAt: '' });
    }
    return json(200, emptyPage);
  });
}

beforeEach(async () => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  useFollowStore.setState({ chosen: {}, pending: {} });
  resetLikes();
  rememberLink(null);
  hideToast();
  closeSheet();
});

afterEach(() => alert.mockRestore());

const juma = () => screen.getByLabelText('Post by juma');

describe('Like (§7.1)', () => {
  it('fills the heart and counts at once, then sends one request after the debounce', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Like'));
    expect(await within(juma()).findByText('13 likes')).toBeTruthy();
    expect(within(juma()).getByLabelText('Unlike')).toBeTruthy();
    expect(sent('PUT', '/api/v1/posts/p1/like')).toHaveLength(0);
    await waitFor(() => expect(sent('PUT', '/api/v1/posts/p1/like')).toHaveLength(1));
    expect(within(juma()).getByText('13 likes')).toBeTruthy();
  });

  it('sends nothing when tapped twice quickly (the final state is the server state)', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Like'));
    fireEvent.press(within(juma()).getByLabelText('Unlike'));
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(requests.filter((r) => r.path.endsWith('/like'))).toHaveLength(0);
    expect(within(juma()).getByText('12 likes')).toBeTruthy();
  });

  it('puts the like back and says so when it fails', async () => {
    api((req) => (req.path === '/api/v1/posts/p1/like' ? apiError(429, 'RATE_LIMITED') : undefined));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Like'));
    expect(await screen.findByText("Couldn't like post")).toBeTruthy();
    expect(within(juma()).getByText('12 likes')).toBeTruthy();
    expect(within(juma()).getByLabelText('Like')).toBeTruthy();
  });

  it('drops a post that no longer exists, quietly', async () => {
    let deleted = false;
    api((req) => {
      if (req.path === '/api/v1/posts/p1/like') { deleted = true; return apiError(404, 'POST_NOT_FOUND'); }
      return deleted && req.path === '/api/v1/feed' ? json(200, { items: [post(2)], nextCursor: null }) : undefined;
    });
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Like'));
    await act(async () => { jest.advanceTimersByTime(500); });
    await waitFor(() => expect(screen.queryByText(/Caption 1/)).toBeNull());
    expect(screen.queryByText("Couldn't like post")).toBeNull();
  });

  it('likes on a double-tap of the photo (and does not open the post); one tap opens it', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(screen.getByLabelText('Photo by juma'));
    fireEvent.press(screen.getByLabelText('Photo by juma'));
    expect(within(juma()).getByText('13 likes')).toBeTruthy();
    await waitFor(() => expect(sent('PUT', '/api/v1/posts/p1/like')).toHaveLength(1));
    expect(screen.queryByText('Post')).toBeNull();

    fireEvent.press(screen.getByLabelText('Photo by juma'));
    expect(await screen.findByText('Post')).toBeTruthy();
  });

  it('changes only the liked post in the cache, so only its card re-renders', () => {
    const queryClient = createQueryClient();
    const [a, b] = [post(1), post(2)] as Post[];
    queryClient.setQueryData<InfiniteData<{ items: Post[]; nextCursor: null }>>(feedKey, { pages: [{ items: [a!, b!], nextCursor: null }], pageParams: [undefined] });
    patchPost(queryClient, 'p1', (p) => ({ ...p, likedByMe: true, likeCount: 13 }));
    const items = queryClient.getQueryData<InfiniteData<{ items: Post[] }>>(feedKey)!.pages[0]!.items;
    expect(items[0]).not.toBe(a);
    expect(items[0]!.likeCount).toBe(13);
    expect(items[1]).toBe(b);
  });
});

describe('Comments (§7.2)', () => {
  const openComments = async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Comments'));
    await screen.findByText(/Comment 1/);
  };

  it('opens from the comment button with the caption pinned and the comments listed', async () => {
    await openComments();
    expect(screen.getByText(/Comment 2/)).toBeTruthy();
    expect(screen.getAllByText(/Caption 1/).length).toBeGreaterThan(0);
  });

  it('opens from "View all N comments" too', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByText('View all 2 comments'));
    expect(await screen.findByText(/Comment 1/)).toBeTruthy();
  });

  it('shows a sent comment at once, then confirms it and updates the count', async () => {
    await openComments();
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), '  Nice photo  ');
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(screen.getByText(/Nice photo/)).toBeTruthy();
    expect(screen.getByText('Sending…')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
    expect(screen.getByText(/Nice photo/)).toBeTruthy();
    const posted = sent('POST', '/api/v1/posts/p1/comments');
    expect(posted).toHaveLength(1);
    expect(posted[0]!.body).toEqual({ body: 'Nice photo' });
    expect(posted[0]!.headers['idempotency-key']).toMatch(/^comment-/);

    fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText('View all 3 comments')).toBeTruthy();
  });

  it('marks a failed comment "Not sent" and retries it with the same key', async () => {
    let fail = true;
    // Offline: fetch itself rejects.
    const fetchStub = global.fetch as jest.Mock;
    const stubbed = fetchStub.getMockImplementation()!;
    fetchStub.mockImplementation(async (url: string, init?: RequestInit) => {
      if (fail && init?.method === 'POST' && url.includes('/posts/p1/comments')) {
        requests.push({ url, path: '/api/v1/posts/p1/comments', method: 'POST', headers: init.headers as Record<string, string>, body: {} });
        throw new TypeError('Network request failed');
      }
      return stubbed(url, init);
    });
    await openComments();
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'Hello');
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('Not sent · Tap to retry', {}, { timeout: 8000 })).toBeTruthy();

    fail = false;
    fireEvent.press(screen.getByText('Not sent · Tap to retry'));
    await waitFor(() => expect(screen.queryByText('Not sent · Tap to retry')).toBeNull());
    await waitFor(() => expect(sent('POST', '/api/v1/posts/p1/comments')).toHaveLength(2));
    const [first, second] = sent('POST', '/api/v1/posts/p1/comments');
    expect(second!.headers['idempotency-key']).toBe(first!.headers['idempotency-key']);
  }, 15_000);

  it('deletes your comment after a long-press and a confirm', async () => {
    await openComments();
    fireEvent(screen.getByText(/Comment 2/), 'longPress');
    expect(sheetOptions()).toEqual(['Delete', 'Cancel']); // your own comment: nothing to report
    pressSheet('Delete');
    expect(alert).toHaveBeenCalledWith('Delete comment?', undefined, expect.any(Array));
    answerAlert('Delete');
    expect(await screen.findByText('Comment deleted')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Comment 2/)).toBeNull());
    expect(sent('DELETE', '/api/v1/comments/c2')).toHaveLength(1);
  });

  it("offers Report on a long-press of someone else's comment", async () => {
    await openComments();
    fireEvent(screen.getByText(/Comment 1/), 'longPress');
    expect(sheetOptions()).toEqual(['Report', 'Cancel']);
  });

  it("hides the input when the post can't take comments (deleted or blocked)", async () => {
    api((req) => (req.method === 'POST' && req.path === '/api/v1/posts/p1/comments' ? apiError(404, 'POST_NOT_FOUND') : undefined));
    await openComments();
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'Hello');
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText("You can't comment on this post")).toBeTruthy();
    expect(screen.queryByLabelText('Add a comment…')).toBeNull();
  });

  it('shows the counter from 900 characters', async () => {
    await openComments();
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'a'.repeat(899));
    expect(screen.queryByText('899/1000')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'a'.repeat(950));
    expect(screen.getByText('950/1000')).toBeTruthy();
  });

  it('says when there are no comments yet', async () => {
    api((req) => (req.path === '/api/v1/posts/p1/comments' ? json(200, emptyPage) : undefined));
    renderRouter(routes, { initialUrl: '/p/p1/comments' });
    expect(await screen.findByText('No comments yet')).toBeTruthy();
  });
});

describe('Share and copy link (§7.3, §8.2)', () => {
  it('opens the share sheet with "{username} on Jamii Air: {link}"', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('Share'));
    expect(share).toHaveBeenCalledWith({ message: 'juma on Jamii Air: https://jamii.test/p/p1' });
    share.mockRestore();
  });

  it('copies the post link from ⋯ (own post: Copy link and Delete)', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 2/);
    fireEvent.press(within(screen.getByLabelText('Post by amina')).getByLabelText('More options'));
    expect(sheetOptions()).toEqual(['Copy link', 'Delete', 'Cancel']);
    pressSheet('Copy link');
    expect(await screen.findByText('Link copied')).toBeTruthy();
    expect(clipboard()).toBe('https://jamii.test/p/p2');
  });

  it("offers Report, Copy link, Unfollow and Block on someone else's post", async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(juma()).getByLabelText('More options'));
    expect(sheetOptions()).toEqual(['Report', 'Copy link', 'Unfollow', 'Block @juma', 'Cancel']);
  });

  it('copies a profile link from the profile ⋯', async () => {
    renderRouter(routes, { initialUrl: '/u/juma' });
    fireEvent.press(await screen.findByLabelText('More options'));
    pressSheet('Copy profile link');
    expect(await screen.findByText('Link copied')).toBeTruthy();
    expect(clipboard()).toBe('https://jamii.test/u/juma');
  });
});

describe('Deep links (§12)', () => {
  it('maps share links and app links onto the routes', () => {
    expect(linkTarget('https://jamii.test/p/abc')).toBe('/p/abc');
    expect(linkTarget('http://192.168.0.65:3000/u/amina?ref=x')).toBe('/u/amina');
    expect(linkTarget('jamiiair://p/abc')).toBe('/p/abc');
    expect(linkTarget('jamiiair:///u/amina/')).toBe('/u/amina');
    expect(linkTarget('/p/abc')).toBe('/p/abc');
    expect(linkTarget('https://jamii.test/settings')).toBeNull();
    expect(linkTarget('https://jamii.test/p/abc/edit')).toBeNull();
    expect(linkTarget('/u/%E0%A4%A')).toBeNull();
  });

  it('opens a link that arrived while signed out once the user logs in', async () => {
    useSession.setState({ status: 'signedOut', accessToken: null, user: null });
    rememberLink('/p/p1');
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Create account');
    act(() => useSession.getState().signIn('token', { id: 'u1', username: 'amina' }));
    expect(await screen.findByText('Post')).toBeTruthy();
    expect(await screen.findByText(/Caption 1/)).toBeTruthy();
  });

  it('waits for onboarding to finish', async () => {
    useSession.setState({ status: 'signedIn', accessToken: 'a', user: { id: 'u1', username: 'amina' }, onboarding: true });
    rememberLink('/u/juma');
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Add a profile photo');
    expect(screen.queryByText('juma')).toBeNull();
    act(() => useSession.getState().finishOnboarding());
    expect(await screen.findAllByText('juma')).toBeTruthy();
  });
});
