// Task 3.8 against a stubbed API: the home feed (cards, paging, states), post detail, deleting your
// own post, and the profile grid (App Flow §5, §7.4, §8.2–8.3).
import { FlashList } from '@shopify/flash-list';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { useFollowStore } from '@/people/follow';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const author = (username: string, id = `id-${username}`) => ({ id, username, displayName: null, avatarUrl: null });
const post = (n: number, extra: object = {}) => ({
  id: `p${n}`, status: 'PUBLISHED', caption: `Caption ${n}`, likeCount: 12, commentCount: 3, likedByMe: false, isMine: false,
  author: author('juma'), media: [{ id: `m${n}`, kind: 'IMAGE', blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', url: `http://img/${n}.webp`, thumbUrl: null, width: 1080, height: 1350 }],
  shareUrl: '', createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ...extra,
});

let requests: StubRequest[];
let alert: jest.SpyInstance;
const answerAlert = (text: string) => {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  act(() => buttons.find((b) => b.text === text)!.onPress!());
};

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') {
      const cursor = new URL(req.url).searchParams.get('cursor');
      return json(200, cursor ? { items: [post(3)], nextCursor: null } : { items: [post(1), post(2, { isMine: true, author: author('amina', 'u1') })], nextCursor: 'c2' });
    }
    if (req.path === '/api/v1/posts/p1') return json(200, post(1));
    if (req.path === '/api/v1/posts/p2' && req.method === 'DELETE') return new Response(null, { status: 204 });
    if (req.path === '/api/v1/users/amina/posts') {
      return json(200, { items: [
        { id: 'p2', status: 'PUBLISHED', thumbUrl: 'http://img/t2.webp', blurhash: null, mediaCount: 1, createdAt: '' },
        { id: 'p9', status: 'PROCESSING', thumbUrl: null, blurhash: null, mediaCount: 1, createdAt: '' },
      ], nextCursor: null });
    }
    if (req.path.startsWith('/api/v1/posts/')) return apiError(404, 'POST_NOT_FOUND');
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
});

afterEach(() => alert.mockRestore());

describe('Home feed (§5)', () => {
  it('shows each post: author, likes, caption, comments link and time', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText(/Caption 1/)).toBeTruthy();
    expect(screen.getAllByText('12 likes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('View all 3 comments').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 h').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Post by amina')).toBeTruthy();
  });

  it('loads the next page near the end, then says you are all caught up', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    act(() => screen.UNSAFE_getByType(FlashList).props.onEndReached());
    expect(await screen.findByText(/Caption 3/)).toBeTruthy();
    expect(await screen.findByText("You're all caught up ✓")).toBeTruthy();
    expect(requests.filter((r) => r.path === '/api/v1/feed').map((r) => new URL(r.url).searchParams.get('cursor'))).toEqual([null, 'c2']);
  });

  it('suggests Find people and a first post when empty', async () => {
    api((req) => (req.path === '/api/v1/feed' ? json(200, emptyPage) : undefined));
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Your feed is empty')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Find people' }));
    expect(await screen.findByLabelText('Search people')).toBeTruthy();
  });

  it('offers Try again when the first load fails', async () => {
    let fail = true;
    api((req) => (req.path === '/api/v1/feed' && fail ? apiError(503, 'SERVICE_UNAVAILABLE') : undefined));
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText("Couldn't load your feed.", {}, { timeout: 8000 })).toBeTruthy();
    fail = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Caption 1/)).toBeTruthy();
  }, 15_000);
});

describe('Post detail and delete (§7.4)', () => {
  it('opens a post from the feed', async () => {
    renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(await screen.findByLabelText('Photo by juma'));
    expect(await screen.findByText('Post')).toBeTruthy();
    await waitFor(() => expect(requests.some((r) => r.path === '/api/v1/posts/p1')).toBe(true));
  });

  it('says a deleted post is no longer available', async () => {
    renderRouter(routes, { initialUrl: '/p/gone' });
    expect(await screen.findByText('This post is no longer available.')).toBeTruthy();
  });

  it('deletes your own post after confirming: gone from the feed, toast shown', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 2/);
    const mine = screen.getByLabelText('Post by amina');
    fireEvent.press(within(mine).getByLabelText('More options'));
    expect(alert).toHaveBeenCalledWith('Delete this post?', "This can't be undone.", expect.any(Array));
    answerAlert('Delete');
    expect(await screen.findByText('Post deleted')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Caption 2/)).toBeNull());
    expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/v1/posts/p2')).toBe(true);
  }, 15_000);
});

describe('Profile grid (§8.3)', () => {
  it('shows thumbnails, marks a post still processing, and opens a post', async () => {
    renderRouter(routes, { initialUrl: '/profile' });
    expect(await screen.findByLabelText('Processing…')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Open post'));
    await waitFor(() => expect(requests.some((r) => r.path === '/api/v1/posts/p2')).toBe(true));
  });
});

