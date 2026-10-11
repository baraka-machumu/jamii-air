// The routing split (App Flow §2–3): signed-out users only reach the auth screens, signed-in users
// land in the tabs, and signing out returns to Welcome.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import AuthLayout from '@/app/(auth)/_layout';
import Welcome from '@/app/(auth)/index';
import LogIn from '@/app/(auth)/login';
import SignUp from '@/app/(auth)/signup';
import TabsLayout from '@/app/(tabs)/_layout';
import Activity from '@/app/(tabs)/activity';
import Create from '@/app/(tabs)/create';
import Home from '@/app/(tabs)/index';
import Profile from '@/app/(tabs)/profile';
import Search from '@/app/(tabs)/search';
import RootLayout from '@/app/_layout';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));

const routes = {
  _layout: RootLayout,
  '(auth)/_layout': AuthLayout,
  '(auth)/index': Welcome,
  '(auth)/login': LogIn,
  '(auth)/signup': SignUp,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': Home,
  '(tabs)/search': Search,
  '(tabs)/create': Create,
  '(tabs)/activity': Activity,
  '(tabs)/profile': Profile,
};

beforeEach(() => {
  useSession.setState({ status: 'signedOut', accessToken: null });
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
