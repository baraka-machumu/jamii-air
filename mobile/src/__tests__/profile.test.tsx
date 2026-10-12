// Task 3.5 screens against a stubbed API: My profile, Edit profile (with the photo), Settings,
// Change password and onboarding step 1 (App Flow §4.2, §8.3, §8.4, §11).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { apiError, emptyPage, json, me, type StubRequest, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///picked.jpg', width: 3000, height: 3000 }] })),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///small.jpg', width: 1080, height: 1080 }) }),
    }),
  },
}));

let requests: StubRequest[];
let alert: jest.SpyInstance;
/** Presses a button of the last Alert shown. */
const answerAlert = (text: string) => {
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  act(() => buttons.find((b) => b.text === text)!.onPress!());
};

function api(overrides: (req: StubRequest) => Response | undefined = () => undefined) {
  requests = stubApi((req) => {
    const custom = overrides(req);
    if (custom) return custom;
    if (req.path === '/api/v1/me' && req.method === 'GET') return json(200, me);
    if (req.path === '/api/v1/me' && req.method === 'PATCH') return json(200, { ...me, ...req.body });
    if (req.path === '/api/v1/users/search') return json(200, { items: [] });
    if (req.path === '/api/v1/feed' || req.path.endsWith('/posts')) return json(200, emptyPage);
    if (req.path === '/api/v1/media/uploads') return json(201, { mediaId: 'media-1', uploadUrl: 'http://storage.test/put', headers: { 'Content-Type': 'image/jpeg' }, expiresAt: '' });
    if (req.url.startsWith('file://')) return new Response(new Uint8Array(2048));
    if (req.path.startsWith('/api/v1/media/')) return json(200, { id: 'media-1', status: 'READY' });
    return new Response(null, { status: 200 });
  });
}
const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);

beforeEach(async () => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  api();
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
});

afterEach(() => alert.mockRestore());

describe('My profile (§8.3)', () => {
  it('shows the photo initial, name, bio and abbreviated counts', async () => {
    renderRouter(routes, { initialUrl: '/profile' });
    expect(await screen.findByText('Mama Lishe, Arusha')).toBeTruthy();
    expect(screen.getByText('Amina')).toBeTruthy();
    expect(screen.getByText('1.2K')).toBeTruthy();
    expect(screen.getByLabelText('1250 Followers')).toBeTruthy();
    expect(screen.queryByText('No posts yet')).toBeNull(); // 12 posts: the grid arrives with 3.8
  });
});

describe('Edit profile (§8.4)', () => {
  it('saves only what changed and shows it on the profile', async () => {
    renderRouter(routes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByText('Edit profile'));
    fireEvent.changeText(await screen.findByLabelText('Bio'), 'Chips na mishkaki');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Chips na mishkaki')).toBeTruthy();
    expect(sent('PATCH', '/api/v1/me')[0]!.body).toEqual({ bio: 'Chips na mishkaki' });
  });

  it('puts a taken username under the field and stays', async () => {
    api((req) => (req.method === 'PATCH' ? apiError(409, 'USERNAME_TAKEN') : undefined));
    renderRouter(routes, { initialUrl: '/edit-profile' });
    fireEvent.changeText(await screen.findByLabelText('Username'), 'juma');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This username is taken.')).toBeTruthy();
  });

  it('asks before throwing away unsaved changes', async () => {
    renderRouter(routes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByText('Edit profile'));
    fireEvent.changeText(await screen.findByLabelText('Name'), 'Amina J');
    fireEvent.press(screen.getByLabelText('Back'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Discard your changes?', undefined, expect.any(Array)));
    answerAlert('Discard');
    expect(await screen.findByText('Mama Lishe, Arusha')).toBeTruthy();
    expect(sent('PATCH', '/api/v1/me')).toHaveLength(0);
  });

  it('uploads a new photo (AVATAR) and attaches it with PATCH /me', async () => {
    renderRouter(routes, { initialUrl: '/edit-profile' });
    fireEvent.press(await screen.findByLabelText('Change photo'));
    answerAlert('Choose from library');
    await waitFor(() => expect(sent('PATCH', '/api/v1/me')).toHaveLength(1));
    expect(sent('POST', '/api/v1/media/uploads')[0]!.body).toMatchObject({ purpose: 'AVATAR', mimeType: 'image/jpeg', byteSize: 2048 });
    expect(requests.some((r) => r.url === 'http://storage.test/put' && r.method === 'PUT')).toBe(true);
    expect(sent('PATCH', '/api/v1/me')[0]!.body).toEqual({ avatarMediaId: 'media-1' });
  });
});

describe('Settings (§11)', () => {
  it('saves the language on the phone and on the account', async () => {
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByText('Kiswahili'));
    expect(await screen.findByText('Mipangilio')).toBeTruthy();
    expect(useSettings.getState().language).toBe('sw');
    expect(JSON.parse((await AsyncStorage.getItem('jamii.settings'))!).state).toEqual({ language: 'sw', theme: 'system' });
    await waitFor(() => expect(sent('PATCH', '/api/v1/me')[0]?.body).toEqual({ locale: 'sw' }));
  });

  it('logs out only after confirming', async () => {
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByLabelText('Log out'));
    expect(useSession.getState().status).toBe('signedIn');
    answerAlert('Log out');
    expect(await screen.findByText('Create account')).toBeTruthy();
  });
});

describe('Change password', () => {
  it('shows a wrong current password under its field', async () => {
    api((req) => (req.path === '/api/v1/auth/password/change' ? apiError(403, 'INVALID_PASSWORD') : undefined));
    renderRouter(routes, { initialUrl: '/settings/password' });
    fireEvent.changeText(await screen.findByLabelText('Current password'), 'old-wrong');
    fireEvent.changeText(screen.getByLabelText('New password'), 'brand-new-pass');
    fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
    expect(useSession.getState().status).toBe('signedIn'); // 403, not 401: still signed in
  });

  it('changes it and goes back', async () => {
    renderRouter(routes, { initialUrl: '/settings' });
    fireEvent.press(await screen.findByLabelText('Change password'));
    fireEvent.changeText(await screen.findByLabelText('Current password'), 'old-pass-1');
    fireEvent.changeText(screen.getByLabelText('New password'), 'brand-new-pass');
    fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Password changed', expect.any(String)));
    expect(sent('POST', '/api/v1/auth/password/change')[0]!.body).toEqual({ currentPassword: 'old-pass-1', newPassword: 'brand-new-pass' });
    expect(await screen.findByText('Settings')).toBeTruthy();
  });
});

describe('Onboarding step 1 (§4.2)', () => {
  beforeEach(() => {
    useSession.setState({ onboarding: true });
  });

  it('opens before the tabs for a new account; Skip goes to Find people', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Add a profile photo')).toBeTruthy();
    expect(screen.queryByTestId('tab-index')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Find people')).toBeTruthy();
  });

  it('saves a bio on Continue, then shows Find people', async () => {
    renderRouter(routes, { initialUrl: '/' });
    fireEvent.changeText(await screen.findByLabelText('Bio'), 'Nauza vitenge');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Find people')).toBeTruthy();
    expect(sent('PATCH', '/api/v1/me')[0]!.body).toEqual({ bio: 'Nauza vitenge' });
  });
});
