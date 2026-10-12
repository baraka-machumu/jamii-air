// The routing split (App Flow §2–3): signed-out users only reach the auth screens, signed-in users
// land in the tabs, and signing out returns to Welcome.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { emptyPage, json, me, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

beforeEach(() => {
  stubApi((req) => (req.path === '/api/v1/me' ? json(200, me) : req.method === 'GET' ? json(200, emptyPage) : json(204)));
  useSession.setState({ status: 'signedOut', accessToken: null, user: null });
  useSettings.setState({ language: 'en', theme: 'system' });
});

describe('routing', () => {
  it('shows Welcome when signed out, and keeps the tabs out of reach', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Create account')).toBeTruthy();
    expect(screen.queryByTestId('tab-index')).toBeNull();
  });

  it('opens the tabs after signing in, and goes back to Welcome on log out', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Create account');
    act(() => useSession.getState().signIn('token'));
    expect(await screen.findByTestId('tab-index')).toBeTruthy();
    expect(await screen.findByText('Your feed is empty')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tab-profile'));
    fireEvent.press(await screen.findByLabelText('Settings'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(await screen.findByLabelText('Log out'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    act(() => alert.mock.calls[0]![2]!.find((b) => b.text === 'Log out')!.onPress!());
    expect(await screen.findByText('Create account')).toBeTruthy();
  });

  it('switches the whole app to Swahili', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Create account');
    fireEvent.press(screen.getByLabelText('Kiswahili'));
    expect(await screen.findByText('Fungua akaunti')).toBeTruthy();
  });
});
