// Task 3.7, the Create flow against a stubbed API (App Flow §6): pick → crop → caption → Share →
// Home with the posting card; a failure offers Retry; an unfinished draft is offered on return.
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { usePosting } from '@/posting/store';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///picked.heic', width: 4032, height: 3024 }] })),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
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
}));

const post = (status: string) => ({ id: 'post-1', status, caption: 'Sokoni', likeCount: 0, commentCount: 0, likedByMe: false, isMine: true, author: {}, media: [], shareUrl: '', createdAt: '' });

let requests: StubRequest[];
let createReply: () => Response;

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  createReply = () => json(201, post('PUBLISHED'));
  requests = stubApi((req) => {
    if (req.path === '/api/v1/posts' && req.method === 'POST') return createReply();
    if (req.path === '/api/v1/me') return json(200, me);
    return json(200, post('PUBLISHED'));
  });
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  usePosting.setState({ draft: null, progress: 0 });
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
    expect(draft.source.uri).toMatch(/\.jpg$/);
    expect(draft.image).toMatchObject({ width: 1536, height: 1536 }); // 2048 × 1536 source, square crop
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('Your feed arrives in task 3.8.')).toBeTruthy(); // Home, visible
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
    await screen.findByText('Your feed arrives in task 3.8.');
    expect(screen.queryByText("Couldn't post")).toBeNull();
  });

  it('offers an unfinished post when coming back to Create', async () => {
    usePosting.getState().start({ uri: 'file:///s.jpg', width: 2048, height: 1536 });
    renderRouter(routes, { initialUrl: '/create' });
    expect(await screen.findByText('You have an unfinished post')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Next' })).toBeTruthy();
  });
});
