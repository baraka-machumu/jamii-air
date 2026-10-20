// The R1 scope change of 2026-10-16 (BRS §6.1) in the app: carousels (BR-CT-09), video posts
// (BR-CT-07/08), replies (BR-FD-08/09), hashtags (BR-FD-10/11) and the post being on screen once
// it is published (BR-FD-12).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useVideoPlayer } from 'expo-video';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Dimensions } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { useActiveVideo } from '@/media/activeVideo';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const author = (username: string, id = `id-${username}`) => ({ id, username, displayName: null, avatarUrl: null });

const image = (n: number) => ({
  id: `m${n}`, kind: 'IMAGE', blurhash: null, url: `http://img/${n}.webp`, thumbUrl: `http://img/${n}-t.webp`,
  posterUrl: null, durationMs: null, width: 1080, height: 1350,
});

const video = {
  id: 'v1', kind: 'VIDEO', blurhash: null, url: 'http://media/video_720.mp4', thumbUrl: 'http://media/thumb.webp',
  posterUrl: 'http://media/poster.webp', durationMs: 42_000, width: 720, height: 1280,
};

const post = (extra: object = {}) => ({
  id: 'p1', status: 'PUBLISHED', type: 'PHOTO', caption: null, likeCount: 0, commentCount: 0, likedByMe: false,
  isMine: false, author: author('juma'), media: [image(1)], shareUrl: '', createdAt: new Date().toISOString(), ...extra,
});

const comment = (extra: object = {}) => ({
  id: 'c1', body: 'Nice shot', author: author('juma'), canDelete: false, replyCount: 0,
  createdAt: new Date().toISOString(), ...extra,
});

let requests: StubRequest[];

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') return json(200, emptyPage);
    return json(200, emptyPage);
  });
}

beforeEach(async () => {
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  useActiveVideo.setState({ playing: null });
});

describe('carousels and video on a card (BR-CT-07/09)', () => {
  it('shows the position counter for a carousel and none for a single photo', async () => {
    api((req) => (req.path === '/api/v1/feed'
      ? json(200, { items: [post({ id: 'p1', media: [image(1), image(2), image(3)] })], nextCursor: null })
      : undefined));
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('1/3')).toBeTruthy();
    // One page per photo, each announced on its own.
    expect(screen.getAllByLabelText('Photo by juma')).toHaveLength(3);
  });

  it('loads the photo on screen and the next, and the rest only as the viewer swipes to them', async () => {
    api((req) => (req.path === '/api/v1/feed'
      ? json(200, { items: [post({ id: 'p1', media: [image(1), image(2), image(3), image(4)] })], nextCursor: null })
      : undefined));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('1/4');

    // Data bundles (BRS §11): the next photo is ready for the swipe, the ones after it are not fetched.
    const sources = () => screen.getAllByLabelText('Photo by juma')
      .map((page) => page.findByProps({ contentFit: 'cover' }).props.source?.uri ?? null);
    expect(sources()).toEqual(['http://img/1.webp', 'http://img/2.webp', null, null]);

    const { width } = Dimensions.get('window');
    fireEvent.scroll(screen.getByTestId('carousel'), { nativeEvent: { contentOffset: { x: width, y: 0 } } });

    expect(screen.getByText('2/4')).toBeTruthy();
    expect(sources()).toEqual(['http://img/1.webp', 'http://img/2.webp', 'http://img/3.webp', null]);
  });

  it('shows a single photo without a carousel counter', async () => {
    api((req) => (req.path === '/api/v1/feed' ? json(200, { items: [post()], nextCursor: null }) : undefined));
    renderRouter(routes, { initialUrl: '/' });

    await screen.findByLabelText('Photo by juma');
    expect(screen.queryByText('1/1')).toBeNull();
  });

  it('shows a video as its poster with the length, and only plays once it is tapped', async () => {
    api((req) => (req.path === '/api/v1/feed'
      ? json(200, { items: [post({ type: 'VIDEO', media: [video] })], nextCursor: null })
      : undefined));
    renderRouter(routes, { initialUrl: '/' });

    // Data bundles: nothing is fetched until the viewer asks for it (BRS §11).
    const play = await screen.findByRole('button', { name: 'Play video' });
    expect(screen.getByText('0:42')).toBeTruthy();

    fireEvent.press(play);
    // Playing: the poster and its play button are replaced by the player and a mute control.
    expect(await screen.findByRole('button', { name: 'Unmute' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play video' })).toBeNull();
  });

  it('says so when a video cannot be played, and tries again on request', async () => {
    api((req) => (req.path === '/api/v1/feed'
      ? json(200, { items: [post({ type: 'VIDEO', media: [video] })], nextCursor: null })
      : undefined));
    renderRouter(routes, { initialUrl: '/' });

    fireEvent.press(await screen.findByRole('button', { name: 'Play video' }));
    await screen.findByRole('button', { name: 'Unmute' });
    const players = jest.mocked(useVideoPlayer).mock.results;
    const first = players.at(-1)!.value as { mockEmit: (name: string, payload: unknown) => void };

    // E.g. the media server refuses the file: a black box would look like it is still loading.
    act(() => first.mockEmit('statusChange', { status: 'error' }));
    expect(screen.getByText("This video can't play right now.")).toBeTruthy();

    const before = players.length;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Unmute' })).toBeTruthy();
    expect(players.length).toBeGreaterThan(before);
    expect(players.at(-1)!.value).not.toBe(first);
  });
});

describe('one video at a time (BR-CT-07, BRS §11)', () => {
  const video2 = { ...video, id: 'v2', url: 'http://media/2/video_720.mp4', posterUrl: 'http://media/2/poster.webp' };
  const twoVideos = () => api((req) => (req.path === '/api/v1/feed'
    ? json(200, { items: [post({ id: 'p1', type: 'VIDEO', media: [video] }), post({ id: 'p2', type: 'VIDEO', media: [video2] })], nextCursor: null })
    : undefined));

  it('stops the playing video when another one is played', async () => {
    twoVideos();
    renderRouter(routes, { initialUrl: '/' });

    const first = (await screen.findAllByRole('button', { name: 'Play video' }))[0]!;
    fireEvent.press(first);
    await screen.findByRole('button', { name: 'Unmute' });
    expect(screen.getAllByRole('button', { name: 'Play video' })).toHaveLength(1);

    fireEvent.press(screen.getByRole('button', { name: 'Play video' }));
    // Still exactly one player: the first went back to its poster.
    expect(await screen.findAllByRole('button', { name: 'Unmute' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Play video' })).toHaveLength(1);
  });

  it('stops a video once its post is scrolled away', async () => {
    twoVideos();
    renderRouter(routes, { initialUrl: '/' });

    const first = (await screen.findAllByRole('button', { name: 'Play video' }))[0]!;
    fireEvent.press(first);
    await screen.findByRole('button', { name: 'Unmute' });

    const feed = screen.UNSAFE_getByType(FlashList);
    // Still on screen: keeps playing.
    act(() => feed.props.onViewableItemsChanged({ viewableItems: [{ item: { id: 'p1' } }, { item: { id: 'p2' } }], changed: [] }));
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy();
    // Scrolled on to the next post: stops.
    act(() => feed.props.onViewableItemsChanged({ viewableItems: [{ item: { id: 'p2' } }], changed: [] }));
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Play video' })).toHaveLength(2);
  });

  const oneVideo = () => api((req) => {
    if (req.path === '/api/v1/feed') return json(200, { items: [post({ type: 'VIDEO', media: [video] })], nextCursor: null });
    if (req.path === '/api/v1/posts/p1') return json(200, post({ type: 'VIDEO', media: [video] }));
    if (req.path === '/api/v1/posts/p1/like') return json(200, { liked: true, likeCount: 1 });
    return undefined;
  });

  it('opens the post on a tap of the video and likes it on a double-tap, as for a photo', async () => {
    oneVideo();
    renderRouter(routes, { initialUrl: '/' });

    const area = await screen.findByRole('button', { name: 'Video by juma' });
    fireEvent.press(area);
    fireEvent.press(area);
    await waitFor(() => expect(requests.some((r) => r.method === 'PUT' && r.path === '/api/v1/posts/p1/like')).toBe(true));

    fireEvent.press(screen.getByRole('button', { name: 'Video by juma' }));
    expect(await screen.findByText('Post')).toBeTruthy();
  });

  it('carries a playing video on into its post, from the same moment and with the same sound', async () => {
    oneVideo();
    renderRouter(routes, { initialUrl: '/' });

    fireEvent.press(await screen.findByRole('button', { name: 'Play video' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Unmute' }));
    const feedPlayer = jest.mocked(useVideoPlayer).mock.results.at(-1)!.value as { currentTime: number };
    feedPlayer.currentTime = 12;

    fireEvent.press(screen.getByRole('button', { name: 'Video by juma' }));
    await screen.findByText('Post');

    // One player, on the post screen, picking up where the feed left off; the feed's is gone.
    expect(await screen.findAllByRole('button', { name: 'Mute' })).toHaveLength(1);
    const postPlayer = jest.mocked(useVideoPlayer).mock.results.at(-1)!.value as { currentTime: number; muted: boolean };
    expect(postPlayer).not.toBe(feedPlayer);
    expect(postPlayer.currentTime).toBe(12);
    expect(postPlayer.muted).toBe(false);
  });

  it('stops a video when the viewer leaves the screen', async () => {
    twoVideos();
    renderRouter(routes, { initialUrl: '/' });

    const first = (await screen.findAllByRole('button', { name: 'Play video' }))[0]!;
    fireEvent.press(first);
    await screen.findByRole('button', { name: 'Unmute' });

    act(() => router.push('/search'));
    expect(useActiveVideo.getState().playing).toBeNull();
  });
});

describe('hashtags (BR-FD-10/11)', () => {
  it('turns a #tag in a caption into a link to that tag, and lists its posts', async () => {
    api((req) => {
      if (req.path === '/api/v1/feed') {
        return json(200, { items: [post({ caption: 'Sunset in #Dar and #dar_es (not C#)' })], nextCursor: null });
      }
      if (req.path === '/api/v1/tags/dar/posts') {
        return json(200, {
          tag: 'dar',
          postCount: 2,
          items: [
            { id: 'p1', status: 'PUBLISHED', type: 'PHOTO', thumbUrl: 'http://img/1-t.webp', blurhash: null, mediaCount: 1, createdAt: new Date().toISOString() },
            { id: 'p2', status: 'PUBLISHED', type: 'VIDEO', thumbUrl: 'http://img/2-t.webp', blurhash: null, mediaCount: 1, createdAt: new Date().toISOString() },
          ],
          nextCursor: null,
        });
      }
      return undefined;
    });
    renderRouter(routes, { initialUrl: '/' });

    // The '#' keeps its case on screen but opens the lower-cased tag the server stores.
    const link = await screen.findByText('#Dar');
    fireEvent.press(link);

    expect(await screen.findByText('#dar')).toBeTruthy(); // the screen's header
    expect(await screen.findByText('2 posts')).toBeTruthy();
    // A video tile is announced as one, so the play badge is not the only clue.
    expect(screen.getByRole('button', { name: 'Open video post' })).toBeTruthy();
    expect(requests.some((r) => r.path === '/api/v1/tags/dar/posts')).toBe(true);
  });

  it('says so when a tag has no posts', async () => {
    api((req) => (req.path === '/api/v1/tags/empty/posts'
      ? json(200, { tag: 'empty', postCount: 0, items: [], nextCursor: null })
      : undefined));
    renderRouter(routes, { initialUrl: '/t/empty' });

    expect(await screen.findByText('Nothing here yet')).toBeTruthy();
  });
});

describe('replies (BR-FD-08/09)', () => {
  const withComments = (replies: object[] = []) => api((req) => {
    if (req.path === '/api/v1/posts/p1') return json(200, post({ commentCount: 1 + replies.length }));
    if (req.path === '/api/v1/posts/p1/comments') {
      if (req.method === 'POST') {
        const sent = req.body as { body: string; parentId?: string };
        return json(201, {
          id: 'new-1', postId: 'p1', parentId: sent.parentId ?? null, body: sent.body,
          createdAt: new Date().toISOString(), commentCount: 2 + replies.length,
          parentReplyCount: sent.parentId ? replies.length + 1 : 0,
        });
      }
      return json(200, { items: [comment({ replyCount: replies.length })], nextCursor: null });
    }
    if (req.path === '/api/v1/comments/c1/replies') return json(200, { items: replies, nextCursor: null });
    return undefined;
  });

  it('keeps a thread collapsed until it is asked for, then shows it oldest first', async () => {
    withComments([
      comment({ id: 'r1', body: 'First reply', author: author('amina', 'u1') }),
      comment({ id: 'r2', body: 'Second reply', author: author('neema') }),
    ]);
    renderRouter(routes, { initialUrl: '/p/p1/comments' });

    // A long thread would push the other comments off the screen, so it starts closed.
    const open = await screen.findByText('View 2 replies');
    expect(screen.queryByText('First reply')).toBeNull();
    expect(requests.some((r) => r.path === '/api/v1/comments/c1/replies')).toBe(false);

    fireEvent.press(open);
    expect(await screen.findByText('First reply')).toBeTruthy();
    expect(screen.getByText('Second reply')).toBeTruthy();
    fireEvent.press(screen.getByText('Hide replies'));
    await waitFor(() => expect(screen.queryByText('First reply')).toBeNull());
  });

  it('sends a reply with its parentId and puts it in the thread', async () => {
    withComments([]);
    renderRouter(routes, { initialUrl: '/p/p1/comments' });

    fireEvent.press(await screen.findByRole('button', { name: 'Reply' }));
    expect(await screen.findByText('Replying to juma')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Reply to juma…'), 'Asante');
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));

    await waitFor(() => {
      const sent = requests.find((r) => r.method === 'POST' && r.path === '/api/v1/posts/p1/comments');
      expect(sent?.body).toEqual({ body: 'Asante', parentId: 'c1' });
    });
    // The reply bar clears once it is sent, so the next comment is not a reply by accident.
    await waitFor(() => expect(screen.queryByText('Replying to juma')).toBeNull());
  });

  it('cancels replying, so the next comment is a top-level one', async () => {
    withComments([]);
    renderRouter(routes, { initialUrl: '/p/p1/comments' });

    fireEvent.press(await screen.findByRole('button', { name: 'Reply' }));
    expect(await screen.findByText('Replying to juma')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel reply' }));

    await waitFor(() => expect(screen.queryByText('Replying to juma')).toBeNull());
    fireEvent.changeText(screen.getByLabelText('Add a comment…'), 'Habari');
    fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => {
      const sent = requests.find((r) => r.method === 'POST' && r.path === '/api/v1/posts/p1/comments');
      expect(sent?.body).toEqual({ body: 'Habari', parentId: undefined });
    });
  });
});

