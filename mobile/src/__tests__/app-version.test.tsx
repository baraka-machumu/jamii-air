// Task 3.12.d: a build the API no longer supports (426 APP_VERSION_UNSUPPORTED) gets the blocking
// Update required screen instead of the app (App Flow §3.3, TRD API-07).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createApiClient } from '@/api/client';
import { requireUpdate, resetUpdateRequired, storeUrl, useUpdateRequired } from '@/app-version/required';
import { UpdateRequired } from '@/components/UpdateRequired';
import '@/i18n';
import { useSession } from '@/stores/session';
import { apiError, emptyPage, json, me, stubApi } from '@/test/api';
import { routes } from '@/test/routes';

jest.mock('@expo-google-fonts/nunito', () => ({ useFonts: () => [true], Nunito_800ExtraBold: 1 }));
jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore'));

beforeEach(() => {
  resetUpdateRequired();
  useSession.setState({ status: 'signedOut', accessToken: null, notice: null });
});

describe('the minimum version the server asks for', () => {
  it('is raised once and never lowered by a later answer', () => {
    requireUpdate('1.2.0');
    requireUpdate('1.3.0');
    expect(useUpdateRequired.getState().minVersion).toBe('1.2.0');
  });

  it('is set by a 426 on any route', async () => {
    const api = createApiClient('http://api.test');
    stubApi(() => apiError(426, 'APP_VERSION_UNSUPPORTED', { minVersion: '2.0.0' }));
    await api.GET('/api/v1/me');
    expect(useUpdateRequired.getState().minVersion).toBe('2.0.0');
  });

  it('is set by a 426 answering the refresh at launch, which no other check sees', async () => {
    const api = createApiClient('http://api.test');
    stubApi(() => apiError(426, 'APP_VERSION_UNSUPPORTED', { minVersion: '2.0.0' }));
    await api.POST('/api/v1/auth/refresh', { body: { refreshToken: 'r' } });
    expect(useUpdateRequired.getState().minVersion).toBe('2.0.0');
  });

  it('is an empty string when an older API sends no details, so the gate still shows', async () => {
    const api = createApiClient('http://api.test');
    stubApi(() => apiError(426, 'APP_VERSION_UNSUPPORTED'));
    await api.GET('/api/v1/me');
    expect(useUpdateRequired.getState().minVersion).toBe('');
  });

  it('is left alone by other failures, including a 426 from something else', async () => {
    const api = createApiClient('http://api.test');
    stubApi(() => apiError(426, 'SOMETHING_ELSE'));
    await api.GET('/api/v1/me');
    stubApi(() => apiError(403, 'ACCOUNT_SUSPENDED'));
    await api.GET('/api/v1/me');
    expect(useUpdateRequired.getState().minVersion).toBeNull();
  });
});

describe('the store link', () => {
  it('is the Play Store page for this package on Android', () => {
    expect(storeUrl('android', { android: { package: 'tz.jamiiair.app' } }))
      .toBe('https://play.google.com/store/apps/details?id=tz.jamiiair.app');
  });

  it('waits for an App Store id on iOS, and there is none for other platforms', () => {
    expect(storeUrl('ios', { ios: {} })).toBeNull();
    expect(storeUrl('ios', { ios: { appStoreId: '123456' } })).toBe('https://apps.apple.com/app/id123456');
    expect(storeUrl('web', { android: { package: 'tz.jamiiair.app' } })).toBeNull();
  });
});

describe('the Update required screen', () => {
  const metrics = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
  const show = (url: string | null) =>
    render(<SafeAreaProvider initialMetrics={metrics}><UpdateRequired url={url} /></SafeAreaProvider>);

  it('replaces the whole app, with no way back to it', async () => {
    stubApi((req) => (req.path === '/api/v1/me' ? json(200, me) : json(200, emptyPage)));
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(screen.getByText('Your people, on air.')).toBeTruthy());

    act(() => { requireUpdate('2.0.0'); });

    await waitFor(() => expect(screen.getByText('Update required')).toBeTruthy());
    expect(screen.queryByText('Your people, on air.')).toBeNull();
    expect(screen.queryByText('Log in')).toBeNull();
  });

  it('says which version is needed and opens the store', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    requireUpdate('2.0.0');
    show('https://play.google.com/store/apps/details?id=tz.jamiiair.app');

    expect(screen.getByText('Version 2.0.0 or newer is needed.')).toBeTruthy();
    fireEvent.press(screen.getByText('Update now'));
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=tz.jamiiair.app');
    open.mockRestore();
  });

  it('leaves out the version an older API did not send, and the button when there is no store page', () => {
    requireUpdate('');
    show(null);
    expect(screen.getByText('Update required')).toBeTruthy();
    expect(screen.queryByText(/or newer is needed/)).toBeNull();
    expect(screen.queryByText('Update now')).toBeNull();
    expect(screen.getByText('Please install the latest build to continue.')).toBeTruthy();
  });
});
