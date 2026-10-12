// Task 3.6 screens against a stubbed API: Search with recent searches, user profile with optimistic
// Follow, follower lists, and onboarding's Find people (App Flow §4.2, §8.1, §8.2).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { useFollowStore } from '@/people/follow';
import { useRecentSearches } from '@/people/recentSearches';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const juma = { id: 'u2', username: 'juma', displayName: 'Juma K', avatarUrl: null, isFollowing: false };
const neema = { id: 'u3', username: 'neema', displayName: null, avatarUrl: null, isFollowing: true };
const profileOf = (user: typeof juma, extra = {}) => ({
  ...user, bio: 'Fundi wa simu', avatarLargeUrl: null, postCount: 0, followerCount: 41, followingCount: 9,
  isMe: false, followsMe: true, isBlockedByMe: false, shareUrl: 'http://x/u/juma', createdAt: '', ...extra,
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
    if (req.path === '/api/v1/users/search') {
      const q = new URL(req.url).searchParams.get('q');
      return json(200, { items: !q ? [juma, neema] : q === 'ju' ? [juma] : [] });
    }
    if (req.path === '/api/v1/users/juma') return json(200, profileOf(juma));
    if (req.path === '/api/v1/users/juma/followers') {
      return json(200, { items: [{ ...neema, isMe: false, followedAt: '' }, { ...me, avatarUrl: null, isFollowing: false, isMe: true, followedAt: '' }], nextCursor: null });
    }
    if (req.path === '/api/v1/users/u2/follow') return json(200, { following: req.method === 'PUT', followerCount: 42 });
    return json(404, { error: { code: 'USER_NOT_FOUND', message: 'x' } });
  });
}
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

beforeEach(async () => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  useFollowStore.setState({ chosen: {}, pending: {} });
  useRecentSearches.setState({ accounts: [] });
});

afterEach(() => alert.mockRestore());

describe('Search (§8.1)', () => {
  it('searches after typing stops, opens a profile and remembers it', async () => {
    renderRouter(routes, { initialUrl: '/search' });
    fireEvent.changeText(await screen.findByLabelText('Search people'), 'j');
    fireEvent.changeText(screen.getByLabelText('Search people'), 'ju');
    fireEvent.press(await screen.findByLabelText('juma'));
    expect(await screen.findByText('Fundi wa simu')).toBeTruthy();
    // One request, for the settled text only (300 ms debounce).
    expect(sent('GET', '/api/v1/users/search').map((r) => new URL(r.url).searchParams.get('q'))).toEqual(['ju']);
    expect(useRecentSearches.getState().accounts.map((a) => a.username)).toEqual(['juma']);
  });

  it('shows recent searches when empty, clearable', async () => {
    useRecentSearches.getState().add(juma);
    renderRouter(routes, { initialUrl: '/search' });
    expect(await screen.findByText('Recent')).toBeTruthy();
    expect(screen.getByText('juma')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Clear all' }));
    expect(await screen.findByText('Find friends by username or name.')).toBeTruthy();
  });

  it('says when nothing matches', async () => {
    renderRouter(routes, { initialUrl: '/search' });
    fireEvent.changeText(await screen.findByLabelText('Search people'), 'zzz');
    expect(await screen.findByText('No accounts found for “zzz”')).toBeTruthy();
  });
});

describe('User profile (§8.2)', () => {
  it('follows at once (button and count), then tells the server', async () => {
    renderRouter(routes, { initialUrl: '/u/juma' });
    expect(await screen.findByText('Follows you')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Follow juma' }));
    expect(screen.getByRole('button', { name: 'Following juma. Tap to unfollow' })).toBeTruthy();
    expect(screen.getByLabelText('42 Followers')).toBeTruthy();
    await waitFor(() => expect(sent('PUT', '/api/v1/users/u2/follow')).toHaveLength(1));
  });

  it('asks before unfollowing', async () => {
    api((req) => (req.path === '/api/v1/users/juma' ? json(200, profileOf({ ...juma, isFollowing: true }, { followerCount: 42 })) : undefined));
    renderRouter(routes, { initialUrl: '/u/juma' });
    fireEvent.press(await screen.findByRole('button', { name: 'Following juma. Tap to unfollow' }));
    expect(alert).toHaveBeenCalledWith('Unfollow @juma?', undefined, expect.any(Array));
    expect(sent('DELETE', '/api/v1/users/u2/follow')).toHaveLength(0);
    answerAlert('Unfollow');
    expect(await screen.findByRole('button', { name: 'Follow juma' })).toBeTruthy();
    expect(screen.getByLabelText('41 Followers')).toBeTruthy();
    await waitFor(() => expect(sent('DELETE', '/api/v1/users/u2/follow')).toHaveLength(1));
  });

  it('rolls back a follow the server refused', async () => {
    api((req) => (req.path === '/api/v1/users/u2/follow' ? apiError(500, 'INTERNAL_ERROR') : undefined));
    renderRouter(routes, { initialUrl: '/u/juma' });
    fireEvent.press(await screen.findByRole('button', { name: 'Follow juma' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't follow", expect.any(String)));
    expect(await screen.findByRole('button', { name: 'Follow juma' })).toBeTruthy();
    expect(screen.getByLabelText('41 Followers')).toBeTruthy();
  });

  it('says an unknown or blocking account is not available', async () => {
    renderRouter(routes, { initialUrl: '/u/ghost' });
    expect(await screen.findByText("This account isn't available")).toBeTruthy();
  });

  it('opens the followers list, without a Follow button on yourself', async () => {
    renderRouter(routes, { initialUrl: '/u/juma' });
    fireEvent.press(await screen.findByLabelText('41 Followers'));
    expect(await screen.findByText('neema')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Following neema. Tap to unfollow' })).toBeTruthy();
    expect(screen.getByText('amina')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow amina' })).toBeNull();
  });
});

describe('Onboarding step 2: Find people (§4.2)', () => {
  it('lists the newest accounts, counts follows, and Continue opens Home', async () => {
    useSession.setState({ onboarding: true });
    renderRouter(routes, { initialUrl: '/onboarding/people' });
    expect(await screen.findByText('Follow at least 1 person to fill your feed.')).toBeTruthy();
    expect(new URL(sent('GET', '/api/v1/users/search')[0]!.url).searchParams.get('q')).toBeNull();
    fireEvent.press(await screen.findByRole('button', { name: 'Follow juma' }));
    expect(await screen.findByText("You're following 1 person.")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
  });
});
