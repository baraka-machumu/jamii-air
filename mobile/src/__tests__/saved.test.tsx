// Kidili K1.5 against a stubbed API: Save on a post (at once, one request per tap, failure puts
// it back) and Saved from the profile menu (App Flow §16.2, §16.10; BR-FD-13).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { tokenStore } from '@/auth/tokenStore';
import { closeSheet } from '@/components/Sheet';
import { hideToast } from '@/components/Toast';
import { resetSaves } from '@/engagement/saves';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

const post = (n: number, extra: object = {}) => ({
  id: `p${n}`, status: 'PUBLISHED', type: 'PHOTO', caption: `Caption ${n}`, likeCount: 0, commentCount: 0, likedByMe: false,
  savedByMe: false, isMine: false, author: { id: 'id-juma', username: 'juma', displayName: null, avatarUrl: null },
  media: [{ id: `m${n}`, kind: 'IMAGE', blurhash: null, url: `http://img/${n}.webp`, thumbUrl: null, width: 1080, height: 1080 }],
  shareUrl: `https://jamii.test/p/p${n}`, createdAt: new Date(Date.now() - 3600 * 1000).toISOString(), ...extra,
});
const tile = (n: number) => ({ id: `p${n}`, type: 'PHOTO', status: 'PUBLISHED', thumbUrl: null, blurhash: null, mediaCount: 1, createdAt: '' });

let requests: StubRequest[];
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);
const card = () => screen.getByLabelText('Post by juma');

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') return json(200, { items: [post(1)], nextCursor: null });
    if (req.path === '/api/v1/posts/p1/save') return json(200, { saved: req.method === 'PUT' });
    return json(200, emptyPage);
  });
}

beforeEach(async () => {
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  resetSaves();
  hideToast();
  closeSheet();
});

describe('Save on a post (§16.2)', () => {
  it('fills the bookmark at once, saves, says where to find it, and unsaves', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(card()).getByRole('button', { name: 'Save' }));
    expect(within(card()).getByRole('button', { name: 'Remove from Saved' })).toBeTruthy();
    await waitFor(() => expect(sent('PUT', '/api/v1/posts/p1/save')).toHaveLength(1));
    expect(await screen.findByText('Saved. Find it in Saved on your profile.')).toBeTruthy();

    fireEvent.press(within(card()).getByRole('button', { name: 'Remove from Saved' }));
    await waitFor(() => expect(sent('DELETE', '/api/v1/posts/p1/save')).toHaveLength(1));
    expect(within(card()).getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('sends a tap made while a request is out after it, so the last tap wins', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(card()).getByRole('button', { name: 'Save' }));
    fireEvent.press(within(card()).getByRole('button', { name: 'Remove from Saved' }));
    await waitFor(() => expect(sent('DELETE', '/api/v1/posts/p1/save')).toHaveLength(1));
    expect(sent('PUT', '/api/v1/posts/p1/save')).toHaveLength(1);
    expect(within(card()).getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('puts the bookmark back and says so when saving fails', async () => {
    api((req) => (req.path === '/api/v1/posts/p1/save' ? apiError(429, 'RATE_LIMITED') : undefined));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    fireEvent.press(within(card()).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Couldn't save the post. Try again.")).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('shows a post saved earlier as saved', async () => {
    api((req) => (req.path === '/api/v1/feed' ? json(200, { items: [post(1, { savedByMe: true })], nextCursor: null }) : undefined));
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText(/Caption 1/);
    expect(within(card()).getByRole('button', { name: 'Remove from Saved' }).props.accessibilityState).toMatchObject({ selected: true });
  });
});

describe('Saved (§16.10)', () => {
  it('opens from the profile menu and shows what you saved', async () => {
    api((req) => (req.path === '/api/v1/me/saved' ? json(200, { items: [tile(1), tile(2)], nextCursor: null }) : undefined));
    renderRouter(routes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByRole('button', { name: 'Menu' }));
    fireEvent.press(await screen.findByTestId('menu-saved'));
    expect(await screen.findByTestId('saved-posts')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open post' })).toHaveLength(2);
  });

  it('says how to save when nothing is saved, and that only you see it', async () => {
    renderRouter(routes, { initialUrl: '/saved' });
    expect(await screen.findByText('Nothing saved yet')).toBeTruthy();
    expect(screen.getByText(/Only you can see what you save/)).toBeTruthy();
  });

  it('offers Settings in the same menu', async () => {
    renderRouter(routes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByRole('button', { name: 'Menu' }));
    fireEvent.press(await screen.findByTestId('menu-settings'));
    expect(await screen.findByLabelText('Log out')).toBeTruthy();
    await act(async () => undefined);
  });
});
