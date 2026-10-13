// The app must never load expo-notifications where it would throw while loading (Expo Go on
// Android, or a dev build without its native side): in development Metro shows that as a fatal
// "Uncaught Error" before any try/catch sees it (found on the reference Android, 2026-10-14).
type Env = { expoGo: boolean; native: boolean };

function pushModuleIn({ expoGo, native }: Env) {
  let loaded = false;
  let result: unknown;
  jest.isolateModules(() => {
    jest.doMock('@/native/available', () => jest.requireActual('@/native/available'));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { executionEnvironment: expoGo ? 'storeClient' : 'bare', expoConfig: {} },
      ExecutionEnvironment: { Bare: 'bare', StoreClient: 'storeClient', Standalone: 'standalone' },
    }));
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => (native ? {} : null) }));
    jest.doMock('expo-notifications', () => { loaded = true; throw new Error('loaded where it throws'); });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    result = (require('@/notifications/push') as typeof import('@/notifications/push')).notificationsModule();
  });
  return { result, loaded };
}

describe('native module checks', () => {
  it('does not load expo-notifications in Expo Go', () => {
    expect(pushModuleIn({ expoGo: true, native: true })).toEqual({ result: null, loaded: false });
  });

  it('does not load it on a build without its native side', () => {
    expect(pushModuleIn({ expoGo: false, native: false })).toEqual({ result: null, loaded: false });
  });

  it('loads it on a build that has it', () => {
    expect(pushModuleIn({ expoGo: false, native: true }).loaded).toBe(true);
  });
});
