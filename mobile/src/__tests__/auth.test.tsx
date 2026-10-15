// The auth screens (App Flow §4) against a stubbed API: what the user sees for each answer.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, Keyboard, Platform, StyleSheet } from 'react-native';
import { tokenStore } from '@/auth/tokenStore';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));
// The native date picker cannot open in tests: two buttons pick an adult or an under-18 date.
jest.mock('@/components/DateField', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DateField: ({ onChange, error }: { onChange: (d: Date) => void; error?: string }) => (
      <>
        <Pressable onPress={() => onChange(new Date(1999, 4, 14))}><Text>pick adult</Text></Pressable>
        <Pressable onPress={() => onChange(new Date(new Date().getFullYear() - 17, 0, 1))}><Text>pick minor</Text></Pressable>
        {error && <Text>{error}</Text>}
      </>
    ),
  };
});

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const apiError = (status: number, code: string, details?: object) => json(status, { error: { code, message: code, details } });
const session = { accessToken: 'access-1', refreshToken: 'refresh-1-xxxxxxxxxxxxxxxx', expiresIn: 900, user: { id: 'u1', username: 'amina' } };

let bodies: Record<string, unknown>[];
let reply: (url: string, body: Record<string, unknown>) => Response;

beforeEach(async () => {
  bodies = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    if (url.includes('/api/v1/feed')) return json(200, { items: [], nextCursor: null }); // Home after sign-in
    const body = init.body ? JSON.parse(init.body as string) : {};
    bodies.push(body);
    return reply(url, body);
  }) as unknown as typeof fetch;
  await tokenStore.clear();
  useSession.setState({ status: 'signedOut', accessToken: null, user: null });
  useSettings.setState({ language: 'en', theme: 'system' });
});

describe('Log in (§4.3)', () => {
  const fill = async () => {
    renderRouter(routes, { initialUrl: '/login' });
    fireEvent.changeText(await screen.findByLabelText('Username or email'), 'amina');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret-pass');
  };

  it('says the details are wrong without saying which', async () => {
    reply = () => apiError(401, 'INVALID_CREDENTIALS');
    await fill();
    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Incorrect username/email or password.')).toBeTruthy();
    expect(useSession.getState().status).toBe('signedOut');
  });

  it('signs in, keeps the refresh token on the device and opens Home', async () => {
    reply = () => json(200, session);
    await fill();
    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    expect(bodies[0]).toEqual({ identifier: 'amina', password: 'secret-pass' });
    expect(await tokenStore.get()).toBe(session.refreshToken);
    expect(useSession.getState().accessToken).toBe('access-1');
  });

  it('offers to cancel a scheduled deletion, then logs in with cancelDeletion', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    reply = (_url, body) => (body.cancelDeletion
      ? json(200, session)
      : apiError(403, 'ACCOUNT_PENDING_DELETION', { deletionDueAt: '2026-11-01T00:00:00.000Z' }));
    await fill();
    fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const buttons = alert.mock.calls[0]![2]!;
    act(() => buttons.find((b) => b.text === 'Cancel deletion')!.onPress!());
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    expect(bodies[1]).toMatchObject({ cancelDeletion: true });
  });
});

describe('the keyboard does not cover the fields (§4.1)', () => {
  // Password is the fourth field on Sign up, so it sits under the keyboard unless the form gives
  // way. KeyboardAvoidingView cannot do that on Android under edge-to-edge, so FormScreen shrinks
  // by the height the keyboard reports (src/components/keyboard.ts).
  type Listener = (e: { endCoordinates: { height: number } }) => void;
  const os = Platform.OS;
  // KeyboardAvoidingView subscribes to the same events, so every listener is kept and fired.
  let listeners: Record<string, Listener[]>;
  const emit = (event: string, height: number) =>
    act(() => { for (const l of listeners[event] ?? []) l({ endCoordinates: { height } }); });

  beforeEach(() => {
    listeners = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: Listener) => {
      (listeners[event] ??= []).push(listener);
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => { Platform.OS = os; jest.restoreAllMocks(); });

  const paddingBottom = () => StyleSheet.flatten(screen.getByTestId('form-body').props.style).paddingBottom;

  it('shrinks the form by the keyboard height on Android, and restores it after', async () => {
    Platform.OS = 'android';
    renderRouter(routes, { initialUrl: '/signup' });
    await screen.findByLabelText('Password');
    expect(paddingBottom()).toBe(0);

    emit('keyboardDidShow', 320);
    expect(paddingBottom()).toBe(320);

    emit('keyboardDidHide', 0);
    expect(paddingBottom()).toBe(0);
  });

  it('leaves it to KeyboardAvoidingView on iOS', async () => {
    Platform.OS = 'ios';
    renderRouter(routes, { initialUrl: '/signup' });
    await screen.findByLabelText('Password');

    emit('keyboardDidShow', 320);
    expect(paddingBottom()).toBe(0);
  });
});

describe('Sign up (§4.1)', () => {
  const fill = async () => {
    renderRouter(routes, { initialUrl: '/signup' });
    fireEvent.changeText(await screen.findByLabelText('Invite code'), 'PILOT1');
    fireEvent.changeText(screen.getByLabelText('Email'), 'amina@example.com');
    fireEvent.changeText(screen.getByLabelText('Username'), 'amina_shop');
    fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough');
    fireEvent.press(screen.getByRole('checkbox'));
  };

  it('stops under-18s at once: message shown, Create account disabled', async () => {
    reply = () => json(201, session);
    await fill();
    fireEvent.press(screen.getByText('pick minor'));
    expect(await screen.findByText('You must be 18 or older to use Jamii Air.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows what is missing on submit instead of calling the API', async () => {
    renderRouter(routes, { initialUrl: '/signup' });
    fireEvent.press(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your date of birth.')).toBeTruthy();
    expect(screen.getByText('Accept the Terms and Privacy Policy to continue.')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('puts a taken username under its field', async () => {
    reply = () => apiError(409, 'USERNAME_TAKEN');
    await fill();
    fireEvent.press(screen.getByText('pick adult'));
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('This username is taken.')).toBeTruthy();
  });

  it('creates the account with the date as YYYY-MM-DD and opens onboarding (§4.2)', async () => {
    reply = (url) => (url.endsWith('/api/v1/me') ? json(200, { ...session.user, avatarUrl: null }) : url.includes('/users/search') ? json(200, { items: [] }) : json(201, session));
    await fill();
    fireEvent.press(screen.getByText('pick adult'));
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Add a profile photo')).toBeTruthy();
    expect(screen.queryByTestId('tab-index')).toBeNull();
    expect(bodies[0]).toEqual({
      email: 'amina@example.com', username: 'amina_shop', password: 'long-enough', dateOfBirth: '1999-05-14',
      inviteCode: 'PILOT1', acceptTerms: true, locale: 'en',
    });
  });
});

describe('Forgot password (§4.4)', () => {
  it('sends a code, resets the password and returns to Log in', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    reply = (url) => (url.endsWith('/forgot') ? json(202) : json(204));
    renderRouter(routes, { initialUrl: '/forgot-password' });
    fireEvent.changeText(await screen.findByLabelText('Email'), 'amina@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText(/we've sent a 6-digit code/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '12a3456');
    fireEvent.changeText(screen.getByLabelText('New password'), 'new-password');
    fireEvent.press(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByLabelText('Username or email')).toBeTruthy();
    expect(bodies[1]).toEqual({ email: 'amina@example.com', code: '123456', newPassword: 'new-password' });
  });

  it('shows a wrong code under the code field', async () => {
    reply = (url) => (url.endsWith('/forgot') ? json(202) : apiError(400, 'RESET_CODE_INVALID'));
    renderRouter(routes, { initialUrl: '/forgot-password' });
    fireEvent.changeText(await screen.findByLabelText('Email'), 'amina@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.changeText(await screen.findByLabelText('6-digit code'), '000000');
    fireEvent.changeText(screen.getByLabelText('New password'), 'new-password');
    fireEvent.press(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText("That code isn't right. Check the email and try again.")).toBeTruthy();
  });
});
