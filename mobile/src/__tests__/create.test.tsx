// Task 3.7 and K1.4b, New post against a stubbed API (App Flow §6, §16.2): pick, caption and Share
// on one screen (Crop is a step that comes back) → Home with the posting card; a failure offers
// Retry; an unfinished draft is shown again.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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
  fireEvent.changeText(await screen.findByLabelText('Caption'), 'Sokoni');
};

describe('New post on one screen (§6, §16.2)', () => {
  it('turns HEIC into an upright JPEG, and shares', async () => {
    await toCaption();
    const draft = usePosting.getState().draft!;
    expect(draft.photos).toHaveLength(1);
    expect(draft.photos[0]!.source.uri).toMatch(/\.jpg$/);
    expect(screen.getByText('2,194 characters left')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Your feed is empty')).toBeTruthy(); // Home, visible
    expect(requests.find((r) => r.path === '/api/v1/posts')!.body).toEqual({ mediaIds: ['media-1'], caption: 'Sokoni' });
    expect(usePosting.getState().draft).toBeNull();
  });

  it('crops square by default when Share is pressed without visiting Crop', async () => {
    await toCaption();
    expect(usePosting.getState().draft!.photos[0]!.image).toBeUndefined();
    createReply = () => apiError(500, 'INTERNAL_ERROR'); // keeps the draft, to look at it
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await screen.findByText("Couldn't post");
    expect(usePosting.getState().draft!.photos[0]!.image).toMatchObject({ width: 1536, height: 1536 }); // 2048 × 1536 source
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

  it('numbers a carousel in the picked order, crops it, and posts it in that order (BR-CT-09)', async () => {
    mockPicked = [photo('one'), photo('two'), photo('three')];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose from library' }));

    // The strip numbers them; picking one shows it in the preview.
    expect(await screen.findByRole('button', { name: 'Photo 3 of 3' })).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Photo 2 of 3' }));
    expect(await screen.findByText('2/3')).toBeTruthy();

    // Crop is a step that comes back here, every photo cropped.
    fireEvent.press(screen.getByRole('button', { name: 'Crop' }));
    expect(await screen.findByText('Photo 2 of 3')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    fireEvent.changeText(await screen.findByLabelText('Caption'), 'Three of them');
    await waitFor(() => expect(usePosting.getState().draft!.photos.every((item) => item.image)).toBe(true));

    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await screen.findByText('Your feed is empty');
    expect(requests.find((r) => r.path === '/api/v1/posts')!.body)
      .toEqual({ mediaIds: ['media-1', 'media-1', 'media-1'], caption: 'Three of them' });
  });

  it('adds more photos after the ones picked, and removes one', async () => {
    mockPicked = [photo('one'), photo('two')];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose from library' }));
    expect(await screen.findByText('1/2')).toBeTruthy();

    mockPicked = [photo('three')];
    fireEvent.press(screen.getByRole('button', { name: 'Add more photos' }));
    expect(await screen.findByRole('button', { name: 'Photo 3 of 3' })).toBeTruthy();
    expect(screen.getByText('3/3')).toBeTruthy(); // the new one is shown

    fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(usePosting.getState().draft!.photos).toHaveLength(2);
    expect(await screen.findByRole('button', { name: 'Photo 2 of 2' })).toBeTruthy();
  });

  it('takes a video with no crop step (BR-CT-07)', async () => {
    mockPicked = [{ uri: 'file:///clip.mp4', width: 720, height: 1280, duration: 42_000, mimeType: 'video/mp4' }];
    renderRouter(routes, { initialUrl: '/create' });
    fireEvent.press(await screen.findByRole('button', { name: 'Choose a video' }));

    fireEvent.changeText(await screen.findByLabelText('Caption'), 'Clip');
    expect(usePosting.getState().draft).toMatchObject({
      photos: [], video: { uri: 'file:///clip.mp4', durationMs: 42_000, mimeType: 'video/mp4' },
    });
    expect(screen.getByText('0:42')).toBeTruthy(); // its length, on the preview
    expect(screen.queryByRole('button', { name: 'Crop' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull(); // photos and a video don't mix

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

  it('shows an unfinished post again, and the close button discards it', async () => {
    usePosting.getState().startPhotos([{ uri: 'file:///s.jpg', width: 2048, height: 1536 }]);
    renderRouter(routes, { initialUrl: '/create' });
    expect(await screen.findByText('1/1')).toBeTruthy();
    expect(screen.getByLabelText('Caption')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    const alert = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(alert[0]).toBe('Discard this post?');
    act(() => alert[2].find((b: { text: string }) => b.text === 'Discard').onPress());
    expect(usePosting.getState().draft).toBeNull();
  });
});
