// Task 3.7, the Create flow against a stubbed API (App Flow §6): pick → crop → caption → Share →
// Home with the posting card; a failure offers Retry; an unfinished draft is offered on return.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { usePosting } from '@/posting/store';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));
// The library hands over whatever `mockPicked` holds, so one test can pick a single photo and
// another a whole carousel (BR-CT-09) or a video (BR-CT-07).
let mockPicked: Record<string, unknown>[] = [];

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: mockPicked.length === 0, assets: mockPicked })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: mockPicked.length === 0, assets: mockPicked })),
}));
jest.mock('expo-image-manipulator', () => {
  const crops: unknown[] = [];
  return {
    crops,
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: {
      manipulate: () => {
        let size = { width: 4032, height: 3024 };
        const context = {
          crop: (rect: { width: number; height: number }) => { crops.push(rect); size = rect; return context; },
          resize: (to: { width?: number; height?: number }) => {
            const ratio = (to.width ?? 0) / size.width || (to.height ?? 0) / size.height;
            size = { width: Math.round(size.width * ratio), height: Math.round(size.height * ratio) };
            return context;
          },
          renderAsync: async () => ({ ...size, saveAsync: async () => ({ uri: `file:///out-${size.width}x${size.height}.jpg`, ...size }) }),
        };
        return context;
      },
    },
  };
});
// Upload progress uses XMLHttpRequest; here the storage PUT simply succeeds.
jest.mock('@/media/upload', () => ({
  ...jest.requireActual('@/media/upload'),
  uploadImage: jest.fn(async (_i: unknown, _p: unknown, o?: { onProgress?: (p: number) => void }) => { o?.onProgress?.(0.4); return 'media-1'; }),
  uploadVideo: jest.fn(async (_v: unknown, o?: { onProgress?: (p: number) => void }) => { o?.onProgress?.(0.4); return 'video-1'; }),
}));

const photo = (name: string) => ({ uri: `file:///${name}.heic`, width: 4032, height: 3024 });

const post = (status: string) => ({ id: 'post-1', status, caption: 'Sokoni', likeCount: 0, commentCount: 0, likedByMe: false, isMine: true, author: {}, media: [], shareUrl: '', createdAt: '' });

let requests: StubRequest[];
let createReply: () => Response;

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  createReply = () => json(201, post('PUBLISHED'));
  requests = stubApi((req) => {
    if (req.path === '/api/v1/posts' && req.method === 'POST') return createReply();
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') return json(200, emptyPage);
    return json(200, post('PUBLISHED'));
  });
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  usePosting.setState({ draft: null, progress: 0 });
  mockPicked = [photo('picked')];
});

const toCaption = async () => {
  renderRouter(routes, { initialUrl: '/create' });
  fireEvent.press(await screen.findByRole('button', { name: 'Choose from library' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
  fireEvent.changeText(await screen.findByLabelText('Caption'), 'Sokoni');
};

describe('Create (§6)', () => {
  it('turns HEIC into an upright JPEG, crops square by default, and shares', async () => {
    await toCaption();
    const draft = usePosting.getState().draft!;
    expect(draft.photos).toHaveLength(1);
    expect(draft.photos[0]!.source.uri).toMatch(/\.jpg$/);
    expect(draft.photos[0]!.image).toMatchObject({ width: 1536, height: 1536 }); // 2048 × 1536 source, square crop
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Your feed is empty')).toBeTruthy(); // Home, visible
    expect(requests.find((r) => r.path === '/api/v1/posts')!.body).toEqual({ mediaIds: ['media-1'], caption: 'Sokoni' });
    expect(usePosting.getState().draft).toBeNull();
  });

  it('shows "Couldn\'t post" with Retry on Home when sharing fails', async () => {
    createReply = () => apiError(500, 'INTERNAL_ERROR');
    await toCaption();
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText("Couldn't post")).toBeTruthy();
    expect(screen.getByText('Something went wrong on our side. Try again.')).toBeTruthy();

    createReply = () => json(201, post('PUBLISHED'));
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Your feed is empty');
    expect(screen.queryByText("Couldn't post")).toBeNull();
  });

  it('crops every photo of a carousel and posts them in the picked order (BR-CT-09)', async () => {
    mockPicked = [photo('one'), photo('two'), photo('three')];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose from library' }));

    // The crop screen shows which photo is being cropped, and the strip switches between them.
    expect(await screen.findByText('Photo 1 of 3')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Photo 2 of 3' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.changeText(await screen.findByLabelText('Caption'), 'Three of them');
    const draft = usePosting.getState().draft!;
    expect(draft.photos).toHaveLength(3);
    expect(draft.photos.every((item) => item.image)).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await screen.findByText('Your feed is empty');
    expect(requests.find((r) => r.path === '/api/v1/posts')!.body)
      .toEqual({ mediaIds: ['media-1', 'media-1', 'media-1'], caption: 'Three of them' });
  });

  it('removes a photo from the carousel before posting', async () => {
    mockPicked = [photo('one'), photo('two')];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose from library' }));
    expect(await screen.findByText('Photo 1 of 2')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(usePosting.getState().draft!.photos).toHaveLength(1);
    // One photo left: no position line, since there is nothing to switch between.
    expect(screen.queryByText('Photo 1 of 1')).toBeNull();
  });

  it('sends a picked video straight to the caption, with no crop step (BR-CT-07)', async () => {
    mockPicked = [{ uri: 'file:///clip.mp4', width: 720, height: 1280, duration: 42_000, mimeType: 'video/mp4' }];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose a video' }));

    // Straight past the crop screen: the caption field is what comes up.
    fireEvent.changeText(await screen.findByLabelText('Caption'), 'Clip');
    expect(usePosting.getState().draft).toMatchObject({
      photos: [], video: { uri: 'file:///clip.mp4', durationMs: 42_000, mimeType: 'video/mp4' },
    });
    expect(screen.getByText('0:42')).toBeTruthy(); // its length, on the preview

    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await screen.findByText('Your feed is empty');
    expect(requests.find((r) => r.path === '/api/v1/posts')!.body).toEqual({ mediaIds: ['video-1'], caption: 'Clip' });
  });

  it('refuses a video longer than a minute before it is uploaded', async () => {
    mockPicked = [{ uri: 'file:///long.mp4', width: 720, height: 1280, duration: 95_000, mimeType: 'video/mp4' }];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose a video' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Video too long', expect.stringContaining('60 seconds')));
    expect(usePosting.getState().draft).toBeNull();
  });

  it('puts the post on screen while the server is still working on it (BR-FD-12)', async () => {
    // The defect: nothing appeared after sharing. A post is PROCESSING until the server has made
    // its sizes — longer still for a video — and the feed only ever returned PUBLISHED posts, so
    // the feed refreshed to exactly what it already showed and the new post was missing until
    // some later refresh. The feed now returns the viewer's own PROCESSING posts, so the card is
    // there at once, holding the place with "Processing…".
    let created = false;
    const mine = (status: string) => ({
      ...post(status),
      caption: 'Sokoni',
      author: { id: 'u1', username: 'amina', displayName: null, avatarUrl: null },
      // Still being processed: no variants yet, which is what the placeholder is drawn from.
      media: [{ id: 'm1', kind: 'IMAGE', blurhash: null, url: null, thumbUrl: null, posterUrl: null, durationMs: null, width: null, height: null }],
    });

    requests = stubApi((req) => {
      if (req.path === '/api/v1/posts' && req.method === 'POST') {
        created = true;
        return json(201, post('PROCESSING'));
      }
      if (req.path === '/api/v1/me') return json(200, me);
      // The post never finishes processing here: that is the case that used to show nothing.
      if (req.path === '/api/v1/feed') return json(200, created ? { items: [mine('PROCESSING')], nextCursor: null } : emptyPage);
      return json(200, post('PROCESSING'));
    });

    await toCaption();
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));

    // No pull-to-refresh and no navigation: the post just shared is on Home, with its caption.
    expect(await screen.findByText('Sokoni')).toBeTruthy();
    expect(screen.queryByText('Your feed is empty')).toBeNull();
  });

  it('offers an unfinished post when coming back to Create', async () => {
    usePosting.getState().startPhotos([{ uri: 'file:///s.jpg', width: 2048, height: 1536 }]);
    renderRouter(routes, { initialUrl: '/create' });
    expect(await screen.findByText('You have an unfinished post')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Next' })).toBeTruthy();
  });
});
