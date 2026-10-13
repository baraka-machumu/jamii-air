// Task 3.10 against a stubbed API and a stubbed expo-notifications: the tab badge, Activity (groups,
// rows, opening, marking read), onboarding step 3, the Settings row, and pushes in every app state
// (App Flow §4.2, §9, §9.1, §11).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { hideToast } from '@/components/Toast';
import { resetLikes } from '@/engagement/likes';
import { rememberLink } from '@/links/pendingLink';
import { useFollowStore } from '@/people/follow';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

type Listener = (event: unknown) => void;
const push = () => (jest.requireMock('expo-notifications') as {
  mockState: { permission: string; answer: string; lastResponse: unknown; received: Listener[]; tapped: Listener[] };
}).mockState;

const actor = (username: string, isFollowing = false) => ({ id: `id-${username}`, username, displayName: null, avatarUrl: null, isFollowing });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const notifications = [
  { id: 'n1', type: 'LIKE', actor: actor('amina'), postId: 'p1', postThumbUrl: 'http://img/t1.webp', commentId: null, commentExcerpt: null, targetAvailable: true, read: false, createdAt: minutesAgo(5) },
  { id: 'n2', type: 'COMMENT', actor: actor('baraka'), postId: 'p2', postThumbUrl: null, commentId: 'c1', commentExcerpt: 'nice!', targetAvailable: false, read: false, createdAt: minutesAgo(10) },
  { id: 'n3', type: 'FOLLOW', actor: actor('neema'), postId: null, postThumbUrl: null, commentId: null, commentExcerpt: null, targetAvailable: true, read: true, createdAt: minutesAgo(60 * 26) },
];
const post = {
  id: 'p1', status: 'PUBLISHED', caption: 'Sunset in Arusha', likeCount: 1, commentCount: 0, likedByMe: false, isMine: true,
  author: { id: 'u1', username: 'amina', displayName: null, avatarUrl: null },
  media: [{ id: 'm1', kind: 'IMAGE', blurhash: null, url: 'http://img/1.webp', thumbUrl: null, width: 1080, height: 1080 }],
  shareUrl: 'https://jamii.test/p/p1', createdAt: minutesAgo(30),
};
const profile = { ...actor('neema'), bio: null, avatarLargeUrl: null, postCount: 0, followerCount: 0, followingCount: 1, isMe: false,
  isFollowing: false, followsMe: true, isBlockedByMe: false, shareUrl: 'https://jamii.test/u/neema', createdAt: '' };

let requests: StubRequest[];
let unread = 2;
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/notifications/unread-count') return json(200, { count: unread });
    if (req.path === '/api/v1/notifications') return json(200, { items: notifications, nextCursor: null });
    if (req.path === '/api/v1/notifications/read') { unread = 0; return json(200, { updated: 2 }); }
    if (req.path.startsWith('/api/v1/me/devices/')) return new Response(null, { status: 204 });
    if (req.path === '/api/v1/posts/p1') return json(200, post);
    if (req.path === '/api/v1/users/neema') return json(200, profile);
    if (req.path === '/api/v1/users/id-neema/follow') return json(200, { following: true, followerCount: 1 });
    if (req.path.startsWith('/api/v1/posts/')) return apiError(404, 'POST_NOT_FOUND');
    return json(200, emptyPage);
  });
}

beforeEach(async () => {
  unread = 2;
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  useFollowStore.setState({ chosen: {}, pending: {} });
  resetLikes();
  rememberLink(null);
  hideToast();
  Object.assign(push(), { permission: 'undetermined', answer: 'granted', lastResponse: null });
});

const tapResponse = (id: string, data: object) => ({ actionIdentifier: 'default', notification: { request: { identifier: id, content: { title: 'Jamii Air', body: 'x', data } } } });

describe('Tab badge (§9)', () => {
  it('shows the unread count on Activity', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByLabelText('Activity, 2')).toBeTruthy();
  });
});

describe('Activity (§9)', () => {
  it('groups New and Earlier with a row per kind', async () => {
    renderRouter(routes, { initialUrl: '/activity' });
    expect(await screen.findByText('New')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByText(/liked your post\./)).toBeTruthy();
    expect(screen.getByText(/commented: “nice!”/)).toBeTruthy();
    expect(screen.getByText(/started following you\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Follow neema' })).toBeTruthy();
  });

  it('marks everything read after 1 s and clears the badge', async () => {
    renderRouter(routes, { initialUrl: '/activity' });
    expect(await screen.findByLabelText('Activity, 2')).toBeTruthy();
    expect(sent('POST', '/api/v1/notifications/read')).toHaveLength(0);
    await act(async () => { jest.advanceTimersByTime(1_000); });
    await waitFor(() => expect(sent('POST', '/api/v1/notifications/read')).toHaveLength(1));
    expect(sent('POST', '/api/v1/notifications/read')[0]!.body).toEqual({ all: true });
    expect(await screen.findByLabelText('Activity')).toBeTruthy();
  });

  it('opens the post of a like', async () => {
    renderRouter(routes, { initialUrl: '/activity' });
    fireEvent.press(await screen.findByText(/liked your post\./));
    expect(await screen.findByText(/Sunset in Arusha/)).toBeTruthy();
  });

  it('says a post that is gone is no longer available', async () => {
    renderRouter(routes, { initialUrl: '/activity' });
    fireEvent.press(await screen.findByText(/commented: “nice!”/));
    expect(await screen.findByText('This post is no longer available.')).toBeTruthy();
    expect(sent('GET', '/api/v1/posts/p2')).toHaveLength(0);
  });

  it('opens the profile of a follower, and follows back', async () => {
    renderRouter(routes, { initialUrl: '/activity' });
    fireEvent.press(await screen.findByRole('button', { name: 'Follow neema' }));
    await waitFor(() => expect(sent('PUT', '/api/v1/users/id-neema/follow')).toHaveLength(1));
    fireEvent.press(screen.getByText(/started following you\./));
    expect(await screen.findByText('Follows you')).toBeTruthy();
  });

  it('says when there is nothing yet', async () => {
    api((req) => (req.path === '/api/v1/notifications' ? json(200, emptyPage) : undefined));
    renderRouter(routes, { initialUrl: '/activity' });
    expect(await screen.findByText('No activity yet')).toBeTruthy();
  });
});

describe('Onboarding step 3: Notifications (§4.2)', () => {
  it('Turn on asks the OS, registers this phone for push, then opens Home', async () => {
    useSession.setState({ onboarding: true });
    renderRouter(routes, { initialUrl: '/onboarding/notifications' });
    fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    const devices = requests.filter((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/me/devices/inst-'));
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]!.body).toMatchObject({ token: 'ExponentPushToken[test]', locale: 'en', appVersion: expect.any(String) });
  });

  it('Not now goes to Home without asking', async () => {
    useSession.setState({ onboarding: true });
    renderRouter(routes, { initialUrl: '/onboarding/notifications' });
    fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    expect(push().permission).toBe('undetermined');
    expect(requests.some((r) => r.path.startsWith('/api/v1/me/devices/'))).toBe(false);
  });

  it('a refusal still goes on to Home, with nothing registered', async () => {
    useSession.setState({ onboarding: true });
    push().answer = 'denied';
    renderRouter(routes, { initialUrl: '/onboarding/notifications' });
    fireEvent.press(await screen.findByRole('button', { name: 'Turn on' }));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    expect(requests.some((r) => r.path.startsWith('/api/v1/me/devices/'))).toBe(false);
  });
});

describe('Settings: Notifications (§11)', () => {
  it('turns them on from Settings, then shows On', async () => {
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('On')).toBeTruthy();
  });

  it('once refused, opens the phone settings', async () => {
    push().permission = 'denied';
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByText('Off')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('Push handling (§9.1)', () => {
  it('registers again at sign-in when allowed', async () => {
    push().permission = 'granted';
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(requests.some((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/me/devices/'))).toBe(true));
  });

  it('in the foreground: a toast instead of a banner, and the badge is read again', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByLabelText('Activity, 2');
    unread = 3;
    act(() => push().received.forEach((l) => l({ request: { identifier: 'r1', content: { title: 'Jamii Air', body: 'juma liked your post.', data: { type: 'LIKE', postId: 'p1' } } } })));
    expect(await screen.findByText('juma liked your post.')).toBeTruthy();
    expect(await screen.findByLabelText('Activity, 3')).toBeTruthy();
  });

  it('a tapped push opens its post (background)', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('tab-index');
    act(() => push().tapped.forEach((l) => l(tapResponse('t1', { type: 'LIKE', postId: 'p1', username: 'juma' }))));
    expect(await screen.findByText(/Sunset in Arusha/)).toBeTruthy();
  });

  it('a tapped follow push opens the profile', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('tab-index');
    act(() => push().tapped.forEach((l) => l(tapResponse('t2', { type: 'FOLLOW', username: 'neema' }))));
    expect(await screen.findByText('Follows you')).toBeTruthy();
  });

  it('the push that launched the app (killed) opens after log-in', async () => {
    useSession.setState({ status: 'signedOut', accessToken: null, user: null });
    push().lastResponse = tapResponse('t3', { type: 'LIKE', postId: 'p1' });
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Create account');
    act(() => useSession.getState().signIn('token', { id: 'u1', username: 'amina' }));
    expect(await screen.findByText(/Sunset in Arusha/)).toBeTruthy();
  });
});
