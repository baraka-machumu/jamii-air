// Kidili navigation (Plan K1.3, App Flow §16.1, §16.5; BR-BN-02…04): the bottom bar Home · Udaku ·
// + · Chat · Profile, the Create menu behind the +, Home's top tabs, and Search and the bell in
// Home's header.
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { tokenStore } from '@/auth/tokenStore';
import { useHomeSection } from '@/stores/home';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { emptyPage, json, me, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

beforeEach(async () => {
  stubApi((req) => {
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/notifications/unread-count') return json(200, { count: 0 });
    return req.method === 'GET' ? json(200, emptyPage) : json(204);
  });
  await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
  useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  useSettings.setState({ language: 'en', theme: 'system' });
  useHomeSection.setState({ section: 'posts' });
});

describe('bottom bar (BR-BN-02)', () => {
  it('is Home · Udaku · + · Chat · Profile, with labels, and no Search or Activity tab', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Your feed is empty');
    for (const [id, label] of [['index', 'Home'], ['udaku', 'Udaku'], ['chat', 'Chat'], ['profile', 'Profile']] as const) {
      expect(within(screen.getByTestId(`tab-${id}`)).getByText(label)).toBeTruthy();
    }
    expect(screen.getByTestId('tab-create')).toBeTruthy();
    expect(screen.queryByTestId('tab-search')).toBeNull();
    expect(screen.queryByTestId('tab-activity')).toBeNull();
  });

  it('shows Udaku and Chat as coming soon until their stage', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Your feed is empty');
    fireEvent.press(screen.getByTestId('tab-udaku'));
    expect(await screen.findByText(/a host posts the news/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('tab-chat'));
    expect(await screen.findByText(/One-to-one messages/)).toBeTruthy();
  });
});

describe('Create menu (§16.5)', () => {
  it('opens from the +, with Post live and the rest coming soon', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Your feed is empty');
    fireEvent.press(screen.getByTestId('tab-create'));

    const sheet = await screen.findByTestId('sheet');
    expect(within(sheet).getByText('Photos or a video for your Home feed')).toBeTruthy();
    for (const key of ['story', 'ocean', 'udaku', 'sell']) {
      expect(screen.getByTestId(`create-${key}`).props.accessibilityState).toMatchObject({ disabled: true });
    }
    expect(within(sheet).getAllByText('Coming soon')).toHaveLength(4);
  });

  it('Post opens New post', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Your feed is empty');
    fireEvent.press(screen.getByTestId('tab-create'));
    fireEvent.press(await screen.findByTestId('create-post'));
    expect(await screen.findByText('New post')).toBeTruthy();
    expect(screen.queryByTestId('sheet')).toBeNull();
  });
});

describe("Home's top tabs (BR-BN-03)", () => {
  it('opens on Posts; Stories, The Ocean and Shops say they are coming', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Your feed is empty')).toBeTruthy();
    expect(screen.getByTestId('home-posts').props.accessibilityState).toMatchObject({ selected: true });

    fireEvent.press(screen.getByTestId('home-stories'));
    expect(await screen.findByText(/gone after 24 hours/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-ocean'));
    expect(await screen.findByText(/Short vertical videos/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-shops'));
    expect(await screen.findByText(/approved sellers/)).toBeTruthy();
    expect(screen.queryByText('Your feed is empty')).toBeNull();

    fireEvent.press(screen.getByTestId('home-posts'));
    expect(await screen.findByText('Your feed is empty')).toBeTruthy();
  });

  it('keeps the chosen tab while the app is open', async () => {
    useHomeSection.setState({ section: 'shops' });
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText(/approved sellers/)).toBeTruthy();
  });
});

describe("Home's header (BR-BN-04)", () => {
  it('opens Search, and Back returns to Home', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('Your feed is empty');
    fireEvent.press(screen.getByLabelText('Search'));
    expect(await screen.findByPlaceholderText('Search people')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText('Your feed is empty')).toBeTruthy();
  });

  it('shows no dot on the bell when nothing is unread', async () => {
    renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
    expect(screen.queryByTestId('bell-dot')).toBeNull();
  });
});
