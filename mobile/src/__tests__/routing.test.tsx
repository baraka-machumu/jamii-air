// The routing split (App Flow §2–3): signed-out users only reach the auth screens, signed-in users
// land in the tabs, and signing out returns to Welcome.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

beforeEach(() => {
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
    expect(screen.getByText('Your feed arrives in task 3.8.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tab-profile'));
    fireEvent.press(await screen.findByText('Log out'));
    expect(await screen.findByText('Create account')).toBeTruthy();
  });

  it('switches the whole app to Swahili', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Create account');
    fireEvent.press(screen.getByLabelText('Kiswahili'));
    expect(await screen.findByText('Fungua akaunti')).toBeTruthy();
  });
});
