// Task 3.12.c, the accessibility pass. These are the rules the app is expected to keep, checked on
// rendered screens rather than by reading the source:
//   - every control a screen reader can reach has a name (its own label, or its text)
//   - text stops growing before it is clipped out of a fixed-height container (maxFontScale)
//   - a screen whose whole body is a spinner says that it is loading
// Design Brief §8 (touch targets, labels) and Guidelines §25.
import { render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactTestInstance } from 'react-test-renderer';
import { tokenStore } from '@/auth/tokenStore';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import '@/i18n';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { emptyPage, json, me, stubApi } from '@/test/api';
import { routes } from '@/test/routes';
import { maxFontScale, palettes } from '@/theme/tokens';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

/** Roles a screen reader stops on and announces by name. */
const INTERACTIVE = ['button', 'tab', 'checkbox', 'radio', 'link', 'switch', 'menuitem'];

const author = { id: 'id-juma', username: 'juma', displayName: null, avatarUrl: null };
const post = {
  id: 'p1', status: 'PUBLISHED', caption: 'Caption 1', likeCount: 12, commentCount: 3, likedByMe: false, isMine: false,
  author, media: [{ id: 'm1', kind: 'IMAGE', blurhash: null, url: 'http://img/1.webp', thumbUrl: null, width: 1080, height: 1350 }],
  shareUrl: 'https://jamii.test/p/p1', createdAt: new Date().toISOString(),
};

/** The text a screen reader would read out of an element: its label, else the words inside it. */
function accessibleName(node: ReactTestInstance): string {
  const label = node.props.accessibilityLabel as string | undefined;
  if (label?.trim()) return label.trim();
  const text = (function words(n: ReactTestInstance | string): string {
    if (typeof n === 'string') return n;
    return (n.children ?? []).map(words).join(' ');
  })(node);
  return text.trim();
}

/** Every reachable control on screen that would be announced with no name. */
function namelessControls(): string[] {
  return INTERACTIVE
    .flatMap((role) => screen.queryAllByRole(role as 'button'))
    .filter((node) => node.props.accessibilityElementsHidden !== true
      && node.props.importantForAccessibility !== 'no'
      && node.props.importantForAccessibility !== 'no-hide-descendants')
    .filter((node) => !accessibleName(node))
    .map((node) => `${String(node.props.accessibilityRole)} in <${String(node.type)}>`);
}

beforeEach(() => {
  useSettings.setState({ language: 'en', theme: 'system' });
  stubApi((req) => {
    if (req.path === '/api/v1/me') return json(200, me);
    if (req.path === '/api/v1/feed') return json(200, { items: [post], nextCursor: null });
    if (req.path === '/api/v1/notifications/unread-count') return json(200, { count: 3 });
    return json(200, emptyPage);
  });
});

describe('every control has a name', () => {
  it('on Welcome, where a signed-out user starts', async () => {
    useSession.setState({ status: 'signedOut', accessToken: null, notice: null });
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText('Log in')).toBeTruthy());
    expect(namelessControls()).toEqual([]);
  });

  it('on Sign up, the longest form (fields, Show, checkbox, date)', async () => {
    useSession.setState({ status: 'signedOut', accessToken: null, notice: null });
    renderRouter(routes, { initialUrl: '/signup' });
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy());
    expect(namelessControls()).toEqual([]);
  });

  it('on the home feed, where the controls are icons: tabs, ⋯, like, comment, share', async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText(/Caption 1/)).toBeTruthy());

    expect(namelessControls()).toEqual([]);
    // The tab bar is icon-only (Swahili labels would not fit), so its labels carry the whole bar.
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.getByLabelText('Activity, 3')).toBeTruthy();
    expect(screen.getByLabelText('Like')).toBeTruthy();
    expect(screen.getByLabelText('More options')).toBeTruthy();
  });
});

describe('text stays inside its container at a large OS font size', () => {
  it('grows nearly twice by default, and only to the compact cap in a fixed-height box', () => {
    render(<Text>Habari</Text>);
    expect(screen.getByText('Habari').props.maxFontSizeMultiplier).toBe(maxFontScale.text);

    render(<Button label="Share" onPress={() => undefined} />);
    expect(screen.getByText('Share').props.maxFontSizeMultiplier).toBe(maxFontScale.compact);
    expect(maxFontScale.compact).toBeLessThan(maxFontScale.text);
  });

  it('lets a caller ask for a tighter cap than the default', () => {
    render(<Text maxFontSizeMultiplier={1}>Fixed</Text>);
    expect(screen.getByText('Fixed').props.maxFontSizeMultiplier).toBe(1);
  });
});

describe('waiting is announced', () => {
  it('names the spinner that stands in for a whole screen', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});

describe('every tab stays visible against the background', () => {
  // The Profile tab is a ring, not a stroked icon, and it used to be `transparent` when unfocused:
  // only a `surface` disc on `bg`, which is about 1.1:1 in both themes and vanishes on a phone.
  // It now takes the same colour as the other four, which is what WCAG's 3:1 for controls needs.
  const signIn = async () => {
    await tokenStore.set('refresh-0-xxxxxxxxxxxxxxxx');
    useSession.setState({ status: 'signedIn', accessToken: 'access-0', user: { id: 'u1', username: 'amina' }, onboarding: false });
  };
  const ringColor = () => {
    const ring = screen.getByTestId('tab-profile')
      .findAll((n) => StyleSheet.flatten(n.props.style ?? {}).borderWidth === 2)[0]!;
    return StyleSheet.flatten(ring.props.style).borderColor as string;
  };

  it('gives the unfocused Profile ring the muted colour, never transparent', async () => {
    await signIn();
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText(/Caption 1/)).toBeTruthy());

    expect(ringColor()).not.toBe('transparent');
    expect(ringColor()).toBe(palettes.light.textMuted);
  });

  it('darkens the ring to the text colour when Profile is the open tab', async () => {
    await signIn();
    renderRouter(routes, { initialUrl: '/profile' });
    await waitFor(() => expect(screen.getByTestId('tab-profile')).toBeTruthy());

    expect(ringColor()).toBe(palettes.light.text);
  });
});
