// Increment A (BRS §6.2) in the app: private accounts against a stubbed API — the private profile
// and Requested (App Flow §8.2a), the Settings switch (§11), Follow requests and Remove follower
// (§8.5), and the new Activity rows (§9).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import { notificationPath } from '@/api/notifications';
import { tokenStore } from '@/auth/tokenStore';
import { useFollowStore } from '@/people/follow';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const person = (username: string, extra: object = {}) =>
  ({ id: `id-${username}`, username, displayName: null, avatarUrl: null, isFollowing: false, ...extra });

const profile = (username: string, extra: object = {}) => ({
  ...person(username), bio: 'Picha za Arusha', avatarLargeUrl: null, postCount: 7, followerCount: 41, followingCount: 9,
  isMe: false, followsMe: false, isBlockedByMe: false, isPrivate: true, canSeeContent: false, followRequested: false,
  followRequestCount: 0, shareUrl: `https://jamii.test/u/${username}`, createdAt: '', ...extra,
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

let requests: StubRequest[];
let alert: jest.SpyInstance;
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);
const answerAlert = (text: string) => {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  act(() => buttons.find((b) => b.text === text)!.onPress!());
};

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
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

describe('a private account seen from outside (§8.2a)', () => {
  it('shows the header and a lock instead of the posts, with counts that open nothing', async () => {
    api((req) => (req.path === '/api/v1/users/zuri' ? json(200, profile('zuri')) : undefined));
    renderRouter(routes, { initialUrl: '/u/zuri' });

    expect(await screen.findByText('This account is private')).toBeTruthy();
    expect(screen.getByText('Follow to see their photos and videos.')).toBeTruthy();
    expect(screen.getByText('Picha za Arusha')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '41 Followers' })).toBeNull();
    expect(screen.getByLabelText('41 Followers')).toBeTruthy();
  });

  it('asks to follow, reads Requested, and cancels after confirming', async () => {
    api((req) => {
      if (req.path === '/api/v1/users/zuri') return json(200, profile('zuri'));
      if (req.path === '/api/v1/users/id-zuri/follow') {
        return json(200, { following: false, requested: req.method === 'PUT', followerCount: 41 });
      }
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/u/zuri' });

    fireEvent.press(await screen.findByRole('button', { name: 'Follow zuri' }));
    // Known to be private, so it goes straight to Requested, and the count does not move.
    expect(screen.getByRole('button', { name: 'Asked to follow zuri. Tap to cancel' })).toBeTruthy();
    expect(screen.getByLabelText('41 Followers')).toBeTruthy();
    await waitFor(() => expect(sent('PUT', '/api/v1/users/id-zuri/follow')).toHaveLength(1));

    fireEvent.press(screen.getByRole('button', { name: 'Asked to follow zuri. Tap to cancel' }));
    expect(alert).toHaveBeenCalledWith('Cancel your request to follow @zuri?', undefined, expect.any(Array));
    answerAlert('Cancel request');
    expect(await screen.findByRole('button', { name: 'Follow zuri' })).toBeTruthy();
    await waitFor(() => expect(sent('DELETE', '/api/v1/users/id-zuri/follow')).toHaveLength(1));
  });

  it('settles on Requested wherever the account was not known to be private', async () => {
    api((req) => {
      if (req.path === '/api/v1/users/amina/followers') {
        return json(200, { items: [{ ...person('zuri'), isMe: false, followedAt: '', followRequested: false }], nextCursor: null });
      }
      if (req.path === '/api/v1/users/id-zuri/follow') return json(200, { following: false, requested: true, followerCount: 41 });
      return undefined;
    });
    useSession.setState({ user: { id: 'u1', username: 'someone_else' } });
    renderRouter(routes, { initialUrl: '/u/amina/followers' });

    fireEvent.press(await screen.findByRole('button', { name: 'Follow zuri' }));
    expect(await screen.findByRole('button', { name: 'Asked to follow zuri. Tap to cancel' })).toBeTruthy();
  });

  it('shows Requested when the server says the request is waiting', async () => {
    api((req) => (req.path === '/api/v1/users/zuri' ? json(200, profile('zuri', { followRequested: true })) : undefined));
    renderRouter(routes, { initialUrl: '/u/zuri' });
    expect(await screen.findByRole('button', { name: 'Asked to follow zuri. Tap to cancel' })).toBeTruthy();
  });

  it('says what unfollowing a private account means', async () => {
    api((req) => (req.path === '/api/v1/users/zuri'
      ? json(200, profile('zuri', { isFollowing: true, canSeeContent: true })) : undefined));
    renderRouter(routes, { initialUrl: '/u/zuri' });
    fireEvent.press(await screen.findByRole('button', { name: 'Following zuri. Tap to unfollow' }));
    expect(alert).toHaveBeenCalledWith('Unfollow @zuri?',
      "Their account is private: you'll need to ask again to see their posts.", expect.any(Array));
  });
});

describe('Settings → Private account (§11)', () => {
  it('says what changes, then switches it on, and offers Follow requests', async () => {
    let isPrivate = false;
    api((req) => {
      if (req.path === '/api/v1/me' && req.method === 'PATCH') {
        isPrivate = (req.body as { isPrivate: boolean }).isPrivate;
        return json(200, { ...me, isPrivate });
      }
      if (req.path === '/api/v1/me') return json(200, { ...me, isPrivate });
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/settings' });

    const toggle = await screen.findByLabelText('Private account');
    fireEvent(toggle, 'valueChange', true);
    expect(alert).toHaveBeenCalledWith('Make your account private?',
      "Only people you approve will see your photos and videos. Your current followers won't be affected.", expect.any(Array));
    expect(sent('PATCH', '/api/v1/me')).toHaveLength(0);
    answerAlert('Make private');
    await waitFor(() => expect(sent('PATCH', '/api/v1/me')[0]?.body).toEqual({ isPrivate: true }));
    expect(await screen.findByRole('button', { name: 'Follow requests' })).toBeTruthy();
  });

  it('warns that going public lets everyone waiting in', async () => {
    api((req) => (req.path === '/api/v1/me' ? json(200, { ...me, isPrivate: true, followRequestCount: 3 }) : undefined));
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent(await screen.findByLabelText('Private account'), 'valueChange', false);
    expect(alert).toHaveBeenCalledWith('Make your account public?',
      'Anyone will be able to see your photos and videos, and the 3 people waiting will be accepted.', expect.any(Array));
  });
});

describe('Follow requests (§8.5)', () => {
  const requestsPage = {
    items: [
      { ...person('juma'), requestedAt: minutesAgo(5) },
      { ...person('neema', { isFollowing: true }), requestedAt: minutesAgo(50) },
    ],
    nextCursor: null,
  };

  it('confirms one (it stays, offering Follow back) and deletes another (it goes)', async () => {
    api((req) => {
      if (req.path === '/api/v1/me/follow-requests') return json(200, requestsPage);
      if (req.path === '/api/v1/me/follow-requests/id-juma/accept') return json(200, { followerCount: 1251 });
      if (req.path === '/api/v1/me/follow-requests/id-neema') return new Response(null, { status: 204 });
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/follow-requests' });

    fireEvent.press(await screen.findByRole('button', { name: 'Let juma follow you' }));
    expect(await screen.findByText('Now follows you')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Follow juma back' })).toBeTruthy();
    expect(sent('POST', '/api/v1/me/follow-requests/id-juma/accept')).toHaveLength(1);

    fireEvent.press(screen.getByRole('button', { name: 'Delete the request from neema' }));
    await waitFor(() => expect(screen.queryByText('neema')).toBeNull());
    expect(sent('DELETE', '/api/v1/me/follow-requests/id-neema')).toHaveLength(1);
  });

  it('says when nobody is waiting', async () => {
    renderRouter(routes, { initialUrl: '/follow-requests' });
    expect(await screen.findByText('No follow requests')).toBeTruthy();
  });

  it('is on the own profile while people are waiting', async () => {
    api((req) => (req.path === '/api/v1/me' ? json(200, { ...me, isPrivate: true, followRequestCount: 2 }) : undefined));
    renderRouter(routes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByRole('button', { name: 'Follow requests · 2' }));
    expect(await screen.findByText('No follow requests')).toBeTruthy();
  });
});

describe('Remove follower (§8.5, BR-PR-09)', () => {
  it('is on your own followers list, asks, and removes the row', async () => {
    api((req) => {
      if (req.path === '/api/v1/users/amina/followers') {
        return json(200, { items: [{ ...person('juma'), isMe: false, followedAt: '', followRequested: false }], nextCursor: null });
      }
      if (req.path === '/api/v1/me/followers/id-juma') return json(200, { followerCount: 1249 });
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/u/amina/followers' });

    fireEvent.press(await screen.findByRole('button', { name: 'Remove juma from your followers' }));
    expect(alert).toHaveBeenCalledWith('Remove @juma?', "They won't be told that you removed them.", expect.any(Array));
    expect(screen.queryByRole('button', { name: 'Follow juma' })).toBeNull();
    answerAlert('Remove');
    await waitFor(() => expect(screen.queryByText('juma')).toBeNull());
    expect(sent('DELETE', '/api/v1/me/followers/id-juma')).toHaveLength(1);
  });
});

describe('Activity rows for requests, acceptances and replies (§9)', () => {
  const row = (id: string, type: string, username: string, extra: object = {}) => ({
    id, type, actor: person(username), postId: null, postThumbUrl: null, commentId: null, commentExcerpt: null,
    targetAvailable: true, read: false, createdAt: minutesAgo(5), ...extra,
  });

  it('says what each one is, and puts Follow requests on top while people are waiting', async () => {
    api((req) => {
      if (req.path === '/api/v1/me') return json(200, { ...me, isPrivate: true, followRequestCount: 1 });
      if (req.path === '/api/v1/notifications') {
        return json(200, { items: [
          row('n1', 'FOLLOW_REQUEST', 'juma'),
          row('n2', 'FOLLOW_ACCEPTED', 'zuri'),
          row('n3', 'REPLY', 'neema', { postId: 'p1', commentId: 'c2', commentExcerpt: 'asante!' }),
        ], nextCursor: null });
      }
      if (req.path === '/api/v1/notifications/unread-count') return json(200, { count: 3 });
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/activity' });

    expect(await screen.findByText(/asked to follow you\./)).toBeTruthy();
    expect(screen.getByText(/accepted your follow request\./)).toBeTruthy();
    // A reply used to read "started following you".
    expect(screen.getByText(/replied: “asante!”/)).toBeTruthy();
    expect(screen.queryByText(/started following you/)).toBeNull();

    fireEvent.press(await screen.findByRole('button', { name: 'Follow requests · 1' }));
    expect(await screen.findByText('No follow requests')).toBeTruthy();
  });

  it('leads a request to the list and an acceptance to the person', () => {
    expect(notificationPath({ type: 'FOLLOW_REQUEST', username: 'juma' })).toBe('/follow-requests');
    expect(notificationPath({ type: 'FOLLOW_ACCEPTED', username: 'zuri' })).toBe('/u/zuri');
    expect(notificationPath({ type: 'REPLY', postId: 'p1', username: 'neema' })).toBe('/p/p1');
  });
});
